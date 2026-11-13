use near_sdk::json_types::U128;
use near_sdk::{
    env, ext_contract, near, require, serde_json, AccountId, Gas, NearToken, PanicOnDefault,
    PromiseOrValue, PromiseResult,
};
use std::collections::{BTreeMap, BTreeSet};

const NANOS_PER_SEC: u64 = 1_000_000_000;
const NANOS_PER_DAY: u64 = 86_400 * NANOS_PER_SEC;
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_FOR_PAYOUT_CALLBACK: Gas = Gas::from_tgas(15);

#[ext_contract(ext_ft)]
pub trait FungibleTokenCore {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_self)]
pub trait LifelineCallbacks {
    fn on_tranche1_transfer(
        &mut self,
        case_id: String,
        winner: AccountId,
        award_amount: U128,
        tranche1: U128,
    ) -> bool;

    fn on_tranche2_transfer(
        &mut self,
        case_id: String,
        winner: AccountId,
        tranche2: U128,
    ) -> bool;
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Open,
    Verified,
    NeedsReview,
    Rejected,
    Bidding,
    Awarded,
    ProofSubmitted,
    Delivered,
    Expired,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Verdict {
    Yes,
    No,
    Abstain,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum Role {
    #[serde(rename = "geo", alias = "Geo")]
    Geo,
    #[serde(rename = "fact", alias = "Fact")]
    Fact,
    #[serde(rename = "sev", alias = "Sev")]
    Sev,
    #[serde(rename = "red", alias = "Red")]
    Red,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Config {
    pub bidding_window_secs: u64,
    pub proof_deadline_secs: u64,
    pub tranche1_bps: u16,
    pub tier_cap: Vec<U128>,
    pub max_case_bps: u16,
    pub daily_limit: U128,
    pub min_reputation: i32,
    pub max_eta_hours: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ConfigInput {
    pub bidding_window_secs: Option<u64>,
    pub proof_deadline_secs: Option<u64>,
    pub tranche1_bps: Option<u16>,
    pub tier_cap: Option<Vec<U128>>,
    pub max_case_bps: Option<u16>,
    pub daily_limit: Option<U128>,
    pub min_reputation: Option<i32>,
    pub max_eta_hours: Option<u32>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ContractConfigView {
    pub owner: AccountId,
    pub pool_token: AccountId,
    pub bidding_window_secs: u64,
    pub proof_deadline_secs: u64,
    pub tranche1_bps: u16,
    pub tier_cap: Vec<U128>,
    pub max_case_bps: u16,
    pub daily_limit: U128,
    pub min_reputation: i32,
    pub max_eta_hours: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Case {
    pub id: String,
    pub geohash: String,
    pub bundle_hash: String,
    pub requested_tier: u8,
    pub tier: u8,
    pub status: Status,
    pub opened_at: u64,
    pub cap: U128,
    pub bidding_ends_at: u64,
    pub winner: Option<AccountId>,
    pub award_amount: U128,
    pub tranche1_paid: U128,
    pub tranche2_paid: U128,
    pub proof_hash: Option<String>,
    pub proof_uri: Option<String>,
    pub proof_deadline: u64,
    pub delivery_retry_count: u8,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Vote {
    pub role: Role,
    pub verifier: AccountId,
    pub verdict: Verdict,
    pub confidence_bps: u16,
    pub tier: u8,
    pub evidence_hash: String,
    pub attestation_hash: Option<String>,
    pub at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Bid {
    pub ngo: AccountId,
    pub ask: U128,
    pub eta_hours: u32,
    pub plan_hash: String,
    pub at: u64,
    pub simulated: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct DeliveryVote {
    pub role: Role,
    pub verifier: AccountId,
    pub ok: bool,
    pub evidence_hash: String,
    pub at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Ngo {
    pub bond: U128,
    pub reputation: i32,
    pub delivered: u32,
    pub failed: u32,
    pub profile_hash: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Donation {
    pub donor: AccountId,
    pub amount: U128,
    pub at: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PoolView {
    pub balance: U128,
    pub reserved: U128,
    pub available: U128,
    pub disbursed_today: U128,
    pub donors_count: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Lifeline {
    pub owner: AccountId,
    pub pool_token: AccountId,
    pub config: Config,

    pub pool_balance: u128,
    pub pool_reserved: u128,
    pub disbursed_today: u128,
    pub last_disbursement_day: u64,
    pub unique_donors: BTreeSet<AccountId>,
    pub donations: Vec<Donation>,

    pub verifiers: BTreeMap<AccountId, Role>,
    pub intake_accounts: BTreeSet<AccountId>,
    pub coordinators: BTreeSet<AccountId>,
    pub ngos: BTreeMap<AccountId, Ngo>,

    pub case_ids: Vec<String>,
    pub cases: BTreeMap<String, Case>,
    pub votes: BTreeMap<String, Vec<Vote>>,
    pub bids: BTreeMap<String, Vec<Bid>>,
    pub delivery_votes: BTreeMap<String, Vec<DeliveryVote>>,

    pub coordinator_decided: BTreeSet<String>,
    pub payout_pending: BTreeSet<String>,
}

#[near]
impl Lifeline {
    #[init]
    pub fn new(owner: AccountId, pool_token: AccountId, config: Option<ConfigInput>) -> Self {
        let mut cfg = Config {
            bidding_window_secs: 90,
            proof_deadline_secs: 300,
            tranche1_bps: 4000,
            tier_cap: vec![
                U128(0),
                U128(2_000_000_000),
                U128(5_000_000_000),
                U128(10_000_000_000),
            ],
            max_case_bps: 2000,
            daily_limit: U128(25_000_000_000),
            min_reputation: 50,
            max_eta_hours: 720,
        };
        if let Some(c) = config {
            apply_config_input(&mut cfg, c);
        }
        validate_config(&cfg);

        let mut intake_accounts = BTreeSet::new();
        intake_accounts.insert(owner.clone());
        let mut coordinators = BTreeSet::new();
        coordinators.insert(owner.clone());

        Self {
            owner,
            pool_token,
            config: cfg,
            pool_balance: 0,
            pool_reserved: 0,
            disbursed_today: 0,
            last_disbursement_day: current_day(),
            unique_donors: BTreeSet::new(),
            donations: Vec::new(),
            verifiers: BTreeMap::new(),
            intake_accounts,
            coordinators,
            ngos: BTreeMap::new(),
            case_ids: Vec::new(),
            cases: BTreeMap::new(),
            votes: BTreeMap::new(),
            bids: BTreeMap::new(),
            delivery_votes: BTreeMap::new(),
            coordinator_decided: BTreeSet::new(),
            payout_pending: BTreeSet::new(),
        }
    }

    // ---- Owner / Admin Configuration ----

    pub fn set_config(&mut self, config: ConfigInput) {
        self.assert_owner();
        let mut updated = self.config.clone();
        apply_config_input(&mut updated, config);
        validate_config(&updated);
        self.config = updated;
    }

    pub fn register_verifier(&mut self, account: AccountId, role: Role) {
        self.assert_owner();
        self.verifiers.insert(account, role);
    }

    pub fn register_intake(&mut self, account: AccountId) {
        self.assert_owner();
        self.intake_accounts.insert(account);
    }

    pub fn register_coordinator(&mut self, account: AccountId) {
        self.assert_owner();
        self.coordinators.insert(account);
    }

    // ---- NGO Registration ----

    #[payable]
    pub fn register_ngo(&mut self, profile_hash: String) {
        let bond = env::attached_deposit().as_yoctonear();
        require!(bond > 0, "Requires attached NEAR bond deposit");
        require!(!profile_hash.is_empty(), "profile_hash cannot be empty");

        let caller = env::predecessor_account_id();
        let ngo = match self.ngos.get(&caller) {
            Some(existing) => Ngo {
                bond: U128(existing.bond.0.saturating_add(bond)),
                reputation: existing.reputation,
                delivered: existing.delivered,
                failed: existing.failed,
                profile_hash,
            },
            None => Ngo {
                bond: U128(bond),
                reputation: 100,
                delivered: 0,
                failed: 0,
                profile_hash,
            },
        };
        self.ngos.insert(caller, ngo);
    }

    // ---- Pool Donations (NEP-141 Receiver) ----

    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.pool_token,
            "Wrong token: only pool_token is accepted"
        );
        require!(amount.0 > 0, "Donation amount must be positive");

        if msg == "panic" {
            env::panic_str("Donation rejected by receiver msg=panic");
        }

        let refund_amount = if let Some(raw_refund) = msg.strip_prefix("refund:") {
            let requested: u128 = raw_refund
                .trim()
                .parse()
                .expect("Invalid refund amount in msg");
            std::cmp::min(requested, amount.0)
        } else {
            0
        };

        let kept = amount.0 - refund_amount;
        if kept > 0 {
            self.pool_balance = self
                .pool_balance
                .checked_add(kept)
                .expect("Pool balance overflow");
            self.unique_donors.insert(sender_id.clone());
            self.donations.push(Donation {
                donor: sender_id.clone(),
                amount: U128(kept),
                at: env::block_timestamp(),
            });

            emit_event(
                "donation",
                serde_json::json!({
                    "donor": sender_id,
                    "amount": U128(kept),
                    "pool_balance": U128(self.pool_balance),
                }),
            );
        }

        PromiseOrValue::Value(U128(refund_amount))
    }

    // ---- Case Intake ----

    pub fn submit_case(
        &mut self,
        case_id: String,
        geohash: String,
        bundle_hash: String,
        requested_tier: u8,
    ) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner || self.intake_accounts.contains(&caller),
            "Unauthorized: caller is not a registered intake account"
        );
        require!(!case_id.is_empty(), "case_id cannot be empty");
        require!(
            !self.cases.contains_key(&case_id),
            "Case already exists"
        );
        require!(
            (1..=4).contains(&requested_tier),
            "requested_tier must be between 1 and 4"
        );

        let now = env::block_timestamp();
        let c = Case {
            id: case_id.clone(),
            geohash: geohash.clone(),
            bundle_hash: bundle_hash.clone(),
            requested_tier,
            tier: requested_tier,
            status: Status::Open,
            opened_at: now,
            cap: U128(0),
            bidding_ends_at: 0,
            winner: None,
            award_amount: U128(0),
            tranche1_paid: U128(0),
            tranche2_paid: U128(0),
            proof_hash: None,
            proof_uri: None,
            proof_deadline: 0,
            delivery_retry_count: 0,
        };

        self.case_ids.push(case_id.clone());
        self.cases.insert(case_id.clone(), c);
        self.votes.insert(case_id.clone(), Vec::new());
        self.bids.insert(case_id.clone(), Vec::new());
        self.delivery_votes.insert(case_id.clone(), Vec::new());

        emit_event(
            "case_opened",
            serde_json::json!({
                "case_id": case_id,
                "geohash": geohash,
                "bundle_hash": bundle_hash,
                "requested_tier": requested_tier,
                "intake": caller,
            }),
        );
    }

    // ---- Verifier Swarm Voting & Quorum + Governor Cap ----

    pub fn vote(
        &mut self,
        case_id: String,
        verdict: Verdict,
        confidence_bps: u16,
        tier: u8,
        evidence_hash: String,
        attestation_hash: Option<String>,
    ) {
        let caller = env::predecessor_account_id();
        let role = *self
            .verifiers
            .get(&caller)
            .expect("Unauthorized: caller is not a registered verifier");

        require!(confidence_bps <= 10_000, "confidence_bps must be <= 10000");

        let mut c = self
            .cases
            .get(&case_id)
            .cloned()
            .expect("Case not found");

        let bids_empty = self.bids.get(&case_id).map(|b| b.is_empty()).unwrap_or(true);
        let can_accept_vote = match c.status {
            Status::Open => true,
            // Allow remaining verifiers of the 4-role swarm to record their votes on-chain
            // when an earlier 3rd Yes or 2nd No already resolved quorum, before any bids arrive.
            Status::Bidding => bids_empty && !self.coordinator_decided.contains(&case_id),
            Status::Rejected => !self.coordinator_decided.contains(&case_id),
            _ => false,
        };
        require!(
            can_accept_vote,
            "Cannot vote: case is no longer accepting verification votes"
        );

        let case_votes = self.votes.entry(case_id.clone()).or_default();
        require!(
            !case_votes
                .iter()
                .any(|v| v.role == role || v.verifier == caller),
            "Verifier already voted on this case"
        );

        let now = env::block_timestamp();
        case_votes.push(Vote {
            role,
            verifier: caller.clone(),
            verdict,
            confidence_bps,
            tier,
            evidence_hash: evidence_hash.clone(),
            attestation_hash,
            at: now,
        });

        emit_event(
            "vote_cast",
            serde_json::json!({
                "case_id": case_id,
                "role": role,
                "verifier": caller,
                "verdict": verdict,
                "confidence_bps": confidence_bps,
                "tier": tier,
                "evidence_hash": evidence_hash,
            }),
        );

        if role == Role::Sev && (1..=4).contains(&tier) {
            c.tier = tier;
        }

        if c.status == Status::Open {
            let yes_count = case_votes.iter().filter(|v| v.verdict == Verdict::Yes).count();
            let no_count = case_votes.iter().filter(|v| v.verdict == Verdict::No).count();

            if yes_count >= 3 {
                self.open_bidding_for_case(&mut c, now);
            } else if no_count >= 2 {
                c.status = Status::Rejected;
                emit_event(
                    "case_rejected",
                    serde_json::json!({
                        "case_id": c.id,
                        "reason": "no_quorum_reached",
                    }),
                );
            } else if case_votes.len() >= 4 {
                c.status = Status::NeedsReview;
                emit_event(
                    "needs_review",
                    serde_json::json!({
                        "case_id": c.id,
                        "yes": yes_count,
                        "no": no_count,
                    }),
                );
            }
        } else if c.status == Status::Bidding && role == Role::Sev && (1..=4).contains(&tier) {
            // If `sev` arrived after the other 3 voted Yes, recompute cap using Sev's tier.
            self.recompute_cap_or_reject(&mut c);
        }

        self.cases.insert(case_id, c);
    }

    // ---- Human Coordinator Gate ----

    pub fn human_confirm(&mut self, case_id: String) {
        self.assert_coordinator();
        let mut c = self.cases.get(&case_id).cloned().expect("Case not found");
        require!(
            c.status == Status::NeedsReview,
            "human_confirm is only valid from NeedsReview"
        );
        self.coordinator_decided.insert(case_id.clone());
        let now = env::block_timestamp();
        self.open_bidding_for_case(&mut c, now);
        self.cases.insert(case_id, c);
    }

    pub fn human_reject(&mut self, case_id: String) {
        self.assert_coordinator();
        let mut c = self.cases.get(&case_id).cloned().expect("Case not found");
        require!(
            c.status == Status::NeedsReview,
            "human_reject is only valid from NeedsReview"
        );
        self.coordinator_decided.insert(case_id.clone());
        c.status = Status::Rejected;
        emit_event(
            "case_rejected",
            serde_json::json!({
                "case_id": c.id,
                "reason": "coordinator_rejected",
            }),
        );
        self.cases.insert(case_id, c);
    }

    // ---- NGO Bidding & Escrow Award (Tranche 1) ----

    pub fn place_bid(
        &mut self,
        case_id: String,
        ask: U128,
        eta_hours: u32,
        plan_hash: String,
        simulated: Option<bool>,
    ) {
        let caller = env::predecessor_account_id();
        require!(
            self.ngos.contains_key(&caller),
            "Unauthorized: caller is not a registered NGO"
        );
        require!(!plan_hash.is_empty(), "plan_hash cannot be empty");

        let c = self.cases.get(&case_id).expect("Case not found");
        require!(
            c.status == Status::Bidding || c.status == Status::Verified,
            "Case is not open for bidding"
        );
        require!(ask.0 > 0, "Bid ask must be positive");
        require!(ask.0 <= c.cap.0, "Bid ask exceeds case spending cap");

        let case_bids = self.bids.entry(case_id.clone()).or_default();
        case_bids.retain(|b| b.ngo != caller);
        let bid = Bid {
            ngo: caller.clone(),
            ask,
            eta_hours,
            plan_hash: plan_hash.clone(),
            at: env::block_timestamp(),
            simulated: simulated.unwrap_or(false),
        };
        case_bids.push(bid);

        emit_event(
            "bid_placed",
            serde_json::json!({
                "case_id": case_id,
                "ngo": caller,
                "ask": ask,
                "eta_hours": eta_hours,
                "plan_hash": plan_hash,
            }),
        );
    }

    pub fn close_bidding(&mut self, case_id: String) -> PromiseOrValue<bool> {
        require!(
            !self.payout_pending.contains(&case_id),
            "A payout transfer is already pending for this case"
        );
        let mut c = self.cases.get(&case_id).cloned().expect("Case not found");
        require!(
            c.status == Status::Bidding || c.status == Status::Verified,
            "Case is not in Bidding state"
        );

        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();
        let case_bids = self.bids.get(&case_id).cloned().unwrap_or_default();

        if now < c.bidding_ends_at {
            let privileged_early_close = (caller == self.owner
                || self.intake_accounts.contains(&caller)
                || self.coordinators.contains(&caller))
                && !case_bids.is_empty();
            require!(
                privileged_early_close,
                "Bidding window has not ended yet"
            );
        }

        // Filter eligible bids by NGO reputation and delivery ETA
        let mut eligible: Vec<(Bid, i32)> = case_bids
            .into_iter()
            .filter_map(|b| {
                let ngo = self.ngos.get(&b.ngo)?;
                if ngo.reputation >= self.config.min_reputation
                    && b.eta_hours <= self.config.max_eta_hours
                    && b.ask.0 <= c.cap.0
                {
                    Some((b, ngo.reputation))
                } else {
                    None
                }
            })
            .collect();

        if eligible.is_empty() {
            c.status = Status::Expired;
            self.cases.insert(case_id.clone(), c);
            emit_event(
                "expired",
                serde_json::json!({
                    "case_id": case_id,
                    "reason": "no_eligible_bids",
                }),
            );
            return PromiseOrValue::Value(false);
        }

        eligible.sort_by(|(a_bid, a_rep), (b_bid, b_rep)| {
            a_bid
                .ask
                .0
                .cmp(&b_bid.ask.0)
                .then_with(|| b_rep.cmp(a_rep))
                .then_with(|| a_bid.eta_hours.cmp(&b_bid.eta_hours))
                .then_with(|| a_bid.at.cmp(&b_bid.at))
        });

        let winner_bid = eligible[0].0.clone();
        let award_amount = winner_bid.ask.0;
        let tranche1 = award_amount
            .checked_mul(self.config.tranche1_bps as u128)
            .expect("Overflow computing tranche1")
            / 10_000;

        self.roll_daily_window_if_needed(now);
        let available = self.available_pool();
        require!(
            award_amount <= available,
            "Insufficient available pool balance for award"
        );
        let daily_remaining = self.config.daily_limit.0.saturating_sub(self.disbursed_today);
        require!(
            tranche1 <= daily_remaining,
            "Tranche 1 exceeds remaining daily disbursement limit"
        );

        // State changes BEFORE cross-contract promise (rollback in callback if transfer fails)
        let reserved_for_tranche2 = award_amount - tranche1;
        self.pool_balance -= tranche1;
        self.pool_reserved += reserved_for_tranche2;
        self.disbursed_today += tranche1;

        c.winner = Some(winner_bid.ngo.clone());
        c.award_amount = U128(award_amount);
        c.tranche1_paid = U128(tranche1);
        c.proof_deadline = now + self.config.proof_deadline_secs * NANOS_PER_SEC;
        c.status = Status::Awarded;
        self.cases.insert(case_id.clone(), c);

        if tranche1 == 0 {
            emit_event(
                "awarded",
                serde_json::json!({
                    "case_id": case_id,
                    "winner": winner_bid.ngo,
                    "award_amount": U128(award_amount),
                }),
            );
            return PromiseOrValue::Value(true);
        }

        self.payout_pending.insert(case_id.clone());

        ext_ft::ext(self.pool_token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                winner_bid.ngo.clone(),
                U128(tranche1),
                Some(format!("LifeLine Tranche 1: {case_id}")),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_PAYOUT_CALLBACK)
                    .on_tranche1_transfer(
                        case_id,
                        winner_bid.ngo,
                        U128(award_amount),
                        U128(tranche1),
                    ),
            )
            .into()
    }

    #[private]
    pub fn on_tranche1_transfer(
        &mut self,
        case_id: String,
        winner: AccountId,
        award_amount: U128,
        tranche1: U128,
    ) -> bool {
        self.payout_pending.remove(&case_id);
        let succeeded = matches!(env::promise_result(0), PromiseResult::Successful(_));

        if succeeded {
            emit_event(
                "awarded",
                serde_json::json!({
                    "case_id": case_id,
                    "winner": winner,
                    "award_amount": award_amount,
                }),
            );
            emit_event(
                "tranche_released",
                serde_json::json!({
                    "case_id": case_id,
                    "tranche": 1,
                    "recipient": winner,
                    "amount": tranche1,
                }),
            );
            return true;
        }

        // Rollback accounting & case state on failed ft_transfer
        let reserved_for_tranche2 = award_amount.0.saturating_sub(tranche1.0);
        self.pool_balance += tranche1.0;
        self.pool_reserved = self.pool_reserved.saturating_sub(reserved_for_tranche2);
        self.disbursed_today = self.disbursed_today.saturating_sub(tranche1.0);

        if let Some(c) = self.cases.get_mut(&case_id) {
            c.winner = None;
            c.award_amount = U128(0);
            c.tranche1_paid = U128(0);
            c.proof_deadline = 0;
            c.status = Status::Bidding;
        }
        false
    }

    // ---- Delivery Proof & Tranche 2 ----

    pub fn submit_proof(&mut self, case_id: String, proof_hash: String, proof_uri: String) {
        require!(
            !self.payout_pending.contains(&case_id),
            "A payout transfer is still pending"
        );
        let mut c = self.cases.get(&case_id).cloned().expect("Case not found");
        require!(
            c.status == Status::Awarded,
            "Proof can only be submitted while case is Awarded"
        );
        let caller = env::predecessor_account_id();
        require!(
            c.winner.as_ref() == Some(&caller),
            "Unauthorized: only the winning NGO can submit proof"
        );
        require!(
            env::block_timestamp() <= c.proof_deadline,
            "Proof deadline has passed"
        );
        require!(!proof_hash.is_empty(), "proof_hash cannot be empty");

        c.proof_hash = Some(proof_hash.clone());
        c.proof_uri = Some(proof_uri.clone());
        c.status = Status::ProofSubmitted;
        self.cases.insert(case_id.clone(), c);
        self.delivery_votes.insert(case_id.clone(), Vec::new());

        emit_event(
            "proof_submitted",
            serde_json::json!({
                "case_id": case_id,
                "ngo": caller,
                "proof_hash": proof_hash,
                "proof_uri": proof_uri,
            }),
        );
    }

    pub fn vote_delivery(
        &mut self,
        case_id: String,
        ok: bool,
        evidence_hash: String,
    ) -> PromiseOrValue<bool> {
        let caller = env::predecessor_account_id();
        let role = *self
            .verifiers
            .get(&caller)
            .expect("Unauthorized: caller is not a registered verifier");

        let mut c = self.cases.get(&case_id).cloned().expect("Case not found");
        require!(
            c.proof_hash.is_some(),
            "No delivery proof has been submitted for this case"
        );
        let can_record = matches!(
            c.status,
            Status::ProofSubmitted | Status::Delivered
        );
        require!(
            can_record,
            "Case is not accepting delivery verification votes"
        );

        let d_votes = self.delivery_votes.entry(case_id.clone()).or_default();
        require!(
            !d_votes
                .iter()
                .any(|v| v.role == role || v.verifier == caller),
            "Verifier already voted on delivery for this proof"
        );

        let now = env::block_timestamp();
        d_votes.push(DeliveryVote {
            role,
            verifier: caller,
            ok,
            evidence_hash,
            at: now,
        });

        if c.status != Status::ProofSubmitted || self.payout_pending.contains(&case_id) {
            return PromiseOrValue::Value(false);
        }

        let ok_count = d_votes.iter().filter(|v| v.ok).count();
        let not_ok_count = d_votes.iter().filter(|v| !v.ok).count();

        if ok_count >= 2 {
            let winner = c.winner.clone().expect("Awarded case missing winner");
            let tranche2 = c.award_amount.0.saturating_sub(c.tranche1_paid.0);

            self.roll_daily_window_if_needed(now);
            let daily_remaining = self.config.daily_limit.0.saturating_sub(self.disbursed_today);
            require!(
                tranche2 <= daily_remaining,
                "Tranche 2 exceeds remaining daily disbursement limit"
            );

            // State changes BEFORE cross-contract promise
            self.pool_balance = self.pool_balance.saturating_sub(tranche2);
            self.pool_reserved = self.pool_reserved.saturating_sub(tranche2);
            self.disbursed_today += tranche2;
            c.tranche2_paid = U128(tranche2);
            c.status = Status::Delivered;
            self.cases.insert(case_id.clone(), c);

            if let Some(ngo) = self.ngos.get_mut(&winner) {
                ngo.reputation += 10;
                ngo.delivered += 1;
            }

            if tranche2 == 0 {
                emit_event(
                    "delivered",
                    serde_json::json!({
                        "case_id": case_id,
                        "winner": winner,
                    }),
                );
                return PromiseOrValue::Value(true);
            }

            self.payout_pending.insert(case_id.clone());

            return ext_ft::ext(self.pool_token.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FOR_FT_TRANSFER)
                .ft_transfer(
                    winner.clone(),
                    U128(tranche2),
                    Some(format!("LifeLine Tranche 2: {case_id}")),
                )
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_PAYOUT_CALLBACK)
                        .on_tranche2_transfer(case_id, winner, U128(tranche2)),
                )
                .into();
        } else if not_ok_count >= 3 {
            if c.delivery_retry_count == 0 {
                c.delivery_retry_count = 1;
                c.status = Status::Awarded;
            } else {
                let remaining = c.award_amount.0.saturating_sub(c.tranche1_paid.0);
                self.pool_reserved = self.pool_reserved.saturating_sub(remaining);
                if let Some(ref winner) = c.winner {
                    if let Some(ngo) = self.ngos.get_mut(winner) {
                        ngo.reputation -= 20;
                        ngo.failed += 1;
                    }
                }
                c.status = Status::Expired;
                emit_event(
                    "expired",
                    serde_json::json!({
                        "case_id": c.id,
                        "reason": "delivery_proof_rejected_twice",
                        "escrow_returned": U128(remaining),
                    }),
                );
            }
            self.cases.insert(case_id, c);
        }

        PromiseOrValue::Value(false)
    }

    #[private]
    pub fn on_tranche2_transfer(
        &mut self,
        case_id: String,
        winner: AccountId,
        tranche2: U128,
    ) -> bool {
        self.payout_pending.remove(&case_id);
        let succeeded = matches!(env::promise_result(0), PromiseResult::Successful(_));

        if succeeded {
            emit_event(
                "tranche_released",
                serde_json::json!({
                    "case_id": case_id,
                    "tranche": 2,
                    "recipient": winner,
                    "amount": tranche2,
                }),
            );
            emit_event(
                "delivered",
                serde_json::json!({
                    "case_id": case_id,
                    "winner": winner,
                    "tranche2_paid": tranche2,
                }),
            );
            return true;
        }

        // Rollback accounting & case state on failed ft_transfer
        self.pool_balance += tranche2.0;
        self.pool_reserved += tranche2.0;
        self.disbursed_today = self.disbursed_today.saturating_sub(tranche2.0);

        if let Some(c) = self.cases.get_mut(&case_id) {
            c.tranche2_paid = U128(0);
            c.status = Status::ProofSubmitted;
        }
        if let Some(ngo) = self.ngos.get_mut(&winner) {
            ngo.reputation -= 10;
            ngo.delivered = ngo.delivered.saturating_sub(1);
        }
        false
    }

    // ---- Expiry ----

    pub fn expire(&mut self, case_id: String) {
        require!(
            !self.payout_pending.contains(&case_id),
            "Cannot expire while a payout transfer is pending"
        );
        let mut c = self.cases.get(&case_id).cloned().expect("Case not found");
        let now = env::block_timestamp();

        if c.status == Status::Bidding || c.status == Status::Verified {
            require!(
                now > c.bidding_ends_at,
                "Bidding deadline has not passed yet"
            );
            c.status = Status::Expired;
            self.cases.insert(case_id.clone(), c);
            emit_event(
                "expired",
                serde_json::json!({
                    "case_id": case_id,
                    "reason": "bidding_deadline_passed",
                }),
            );
        } else if c.status == Status::Awarded {
            require!(
                now > c.proof_deadline,
                "Proof deadline has not passed yet"
            );
            let remaining = c.award_amount.0.saturating_sub(c.tranche1_paid.0);
            self.pool_reserved = self.pool_reserved.saturating_sub(remaining);
            if let Some(ref winner) = c.winner {
                if let Some(ngo) = self.ngos.get_mut(winner) {
                    ngo.reputation -= 20;
                    ngo.failed += 1;
                }
            }
            c.status = Status::Expired;
            self.cases.insert(case_id.clone(), c);
            emit_event(
                "expired",
                serde_json::json!({
                    "case_id": case_id,
                    "reason": "proof_deadline_passed",
                    "escrow_returned": U128(remaining),
                }),
            );
        } else {
            env::panic_str("Case cannot be expired in its current status");
        }
    }

    // ---- View Methods ----

    pub fn get_config(&self) -> ContractConfigView {
        ContractConfigView {
            owner: self.owner.clone(),
            pool_token: self.pool_token.clone(),
            bidding_window_secs: self.config.bidding_window_secs,
            proof_deadline_secs: self.config.proof_deadline_secs,
            tranche1_bps: self.config.tranche1_bps,
            tier_cap: self.config.tier_cap.clone(),
            max_case_bps: self.config.max_case_bps,
            daily_limit: self.config.daily_limit,
            min_reputation: self.config.min_reputation,
            max_eta_hours: self.config.max_eta_hours,
        }
    }

    pub fn get_pool(&self) -> PoolView {
        let disbursed = if current_day() > self.last_disbursement_day {
            0
        } else {
            self.disbursed_today
        };
        PoolView {
            balance: U128(self.pool_balance),
            reserved: U128(self.pool_reserved),
            available: U128(self.available_pool()),
            disbursed_today: U128(disbursed),
            donors_count: self.unique_donors.len() as u32,
        }
    }

    pub fn get_case(&self, case_id: String) -> Option<Case> {
        self.cases.get(&case_id).cloned()
    }

    pub fn list_cases(
        &self,
        from: Option<u32>,
        limit: Option<u32>,
        status: Option<Status>,
    ) -> Vec<Case> {
        let start = from.unwrap_or(0) as usize;
        let max_items = limit.unwrap_or(50) as usize;

        self.case_ids
            .iter()
            .rev()
            .filter_map(|id| self.cases.get(id))
            .filter(|c| status.map(|s| c.status == s).unwrap_or(true))
            .skip(start)
            .take(max_items)
            .cloned()
            .collect()
    }

    pub fn get_votes(&self, case_id: String) -> Vec<Vote> {
        self.votes.get(&case_id).cloned().unwrap_or_default()
    }

    pub fn get_bids(&self, case_id: String) -> Vec<Bid> {
        self.bids.get(&case_id).cloned().unwrap_or_default()
    }

    pub fn get_delivery_votes(&self, case_id: String) -> Vec<DeliveryVote> {
        self.delivery_votes.get(&case_id).cloned().unwrap_or_default()
    }

    pub fn get_ngo(&self, account_id: AccountId) -> Option<Ngo> {
        self.ngos.get(&account_id).cloned()
    }

    pub fn get_donations(&self, from: Option<u32>, limit: Option<u32>) -> Vec<Donation> {
        let start = from.unwrap_or(0) as usize;
        let max_items = limit.unwrap_or(20) as usize;
        self.donations
            .iter()
            .rev()
            .skip(start)
            .take(max_items)
            .cloned()
            .collect()
    }
}

impl Lifeline {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Unauthorized: owner only"
        );
    }

    fn assert_coordinator(&self) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner || self.coordinators.contains(&caller),
            "Unauthorized: coordinator only"
        );
    }

    fn available_pool(&self) -> u128 {
        self.pool_balance.saturating_sub(self.pool_reserved)
    }

    fn roll_daily_window_if_needed(&mut self, now_ns: u64) {
        let day = now_ns / NANOS_PER_DAY;
        if day > self.last_disbursement_day {
            self.disbursed_today = 0;
            self.last_disbursement_day = day;
        }
    }

    fn compute_cap(&mut self, tier: u8, now_ns: u64) -> u128 {
        if tier <= 1 {
            return 0;
        }
        self.roll_daily_window_if_needed(now_ns);

        let idx = (tier as usize).saturating_sub(1);
        let tier_cap = self.config.tier_cap.get(idx).map(|v| v.0).unwrap_or(0);
        let available = self.available_pool();
        let pool_pct_cap = available
            .checked_mul(self.config.max_case_bps as u128)
            .unwrap_or(u128::MAX)
            / 10_000;
        let daily_remaining = self.config.daily_limit.0.saturating_sub(self.disbursed_today);

        tier_cap.min(pool_pct_cap).min(daily_remaining)
    }

    fn open_bidding_for_case(&mut self, c: &mut Case, now_ns: u64) {
        let effective_tier = if c.tier > 0 { c.tier } else { c.requested_tier };
        if effective_tier <= 1 {
            c.cap = U128(0);
            c.status = Status::Rejected;
            emit_event(
                "case_rejected",
                serde_json::json!({
                    "case_id": c.id,
                    "reason": "tier_1_no_funding",
                }),
            );
            return;
        }

        let cap = self.compute_cap(effective_tier, now_ns);
        if cap == 0 {
            c.cap = U128(0);
            c.status = Status::Rejected;
            emit_event(
                "case_rejected",
                serde_json::json!({
                    "case_id": c.id,
                    "reason": "no_funds",
                }),
            );
            return;
        }

        c.cap = U128(cap);
        c.status = Status::Bidding;
        c.bidding_ends_at = now_ns + self.config.bidding_window_secs * NANOS_PER_SEC;

        emit_event(
            "case_verified",
            serde_json::json!({
                "case_id": c.id,
                "tier": effective_tier,
                "cap": U128(cap),
            }),
        );
        emit_event(
            "bidding_opened",
            serde_json::json!({
                "case_id": c.id,
                "cap": U128(cap),
                "bidding_ends_at": c.bidding_ends_at,
            }),
        );
    }

    fn recompute_cap_or_reject(&mut self, c: &mut Case) {
        let now = env::block_timestamp();
        if c.tier <= 1 {
            c.cap = U128(0);
            c.status = Status::Rejected;
            emit_event(
                "case_rejected",
                serde_json::json!({
                    "case_id": c.id,
                    "reason": "tier_1_no_funding",
                }),
            );
            return;
        }
        let cap = self.compute_cap(c.tier, now);
        if cap == 0 {
            c.cap = U128(0);
            c.status = Status::Rejected;
            emit_event(
                "case_rejected",
                serde_json::json!({
                    "case_id": c.id,
                    "reason": "no_funds",
                }),
            );
        } else {
            c.cap = U128(cap);
        }
    }
}

fn current_day() -> u64 {
    env::block_timestamp() / NANOS_PER_DAY
}

fn apply_config_input(cfg: &mut Config, input: ConfigInput) {
    if let Some(v) = input.bidding_window_secs {
        cfg.bidding_window_secs = v;
    }
    if let Some(v) = input.proof_deadline_secs {
        cfg.proof_deadline_secs = v;
    }
    if let Some(v) = input.tranche1_bps {
        cfg.tranche1_bps = v;
    }
    if let Some(v) = input.tier_cap {
        cfg.tier_cap = v;
    }
    if let Some(v) = input.max_case_bps {
        cfg.max_case_bps = v;
    }
    if let Some(v) = input.daily_limit {
        cfg.daily_limit = v;
    }
    if let Some(v) = input.min_reputation {
        cfg.min_reputation = v;
    }
    if let Some(v) = input.max_eta_hours {
        cfg.max_eta_hours = v;
    }
}

fn validate_config(cfg: &Config) {
    require!(cfg.tier_cap.len() == 4, "tier_cap must have 4 entries (tiers 1..4)");
    require!(cfg.tier_cap[0].0 == 0, "tier 1 cap must be 0");
    require!(cfg.tranche1_bps <= 10_000, "tranche1_bps must be <= 10000");
    require!(cfg.max_case_bps <= 10_000, "max_case_bps must be <= 10000");
    require!(cfg.bidding_window_secs > 0, "bidding_window_secs must be > 0");
    require!(cfg.proof_deadline_secs > 0, "proof_deadline_secs must be > 0");
}

fn emit_event(event: &str, data: serde_json::Value) {
    let payload = serde_json::json!({
        "standard": "lifeline",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, RuntimeFeesConfig};

    fn acct(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn ctx(predecessor: &str, deposit_yocto: u128, ts_ns: u64) {
        let builder = VMContextBuilder::new()
            .current_account_id(acct("lifeline.testnet"))
            .predecessor_account_id(acct(predecessor))
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
            .block_timestamp(ts_ns)
            .build();
        testing_env!(builder);
    }

    fn setup_contract() -> Lifeline {
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("owner.testnet", 0, t0);
        let mut c = Lifeline::new(acct("owner.testnet"), acct("mock-ft.testnet"), None);
        c.register_intake(acct("intake.testnet"));
        c.register_verifier(acct("v-geo.testnet"), Role::Geo);
        c.register_verifier(acct("v-fact.testnet"), Role::Fact);
        c.register_verifier(acct("v-sev.testnet"), Role::Sev);
        c.register_verifier(acct("v-red.testnet"), Role::Red);
        c.register_coordinator(acct("coord.testnet"));

        // Fund pool with 50,000 USDC (6 decimals)
        ctx("mock-ft.testnet", 0, t0);
        let ret = c.ft_on_transfer(
            acct("donor.testnet"),
            U128(50_000_000_000),
            "".to_string(),
        );
        match ret {
            PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
            _ => panic!("Expected immediate Value(0)"),
        }

        // Register 2 NGOs
        ctx("ngo-1.testnet", 1_000_000_000_000_000_000_000_000, t0);
        c.register_ngo("b1".repeat(32));
        ctx("ngo-2.testnet", 1_000_000_000_000_000_000_000_000, t0);
        c.register_ngo("b2".repeat(32));

        c
    }

    #[test]
    #[should_panic(expected = "not a registered intake account")]
    fn forged_intake_is_rejected() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("attacker.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);
    }

    #[test]
    #[should_panic(expected = "not a registered verifier")]
    fn forged_verifier_is_rejected() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);

        ctx("attacker.testnet", 0, t0 + NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
    }

    #[test]
    #[should_panic(expected = "already voted")]
    fn double_vote_is_rejected() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);

        ctx("v-geo.testnet", 0, t0 + NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
    }

    #[test]
    fn quorum_three_yes_opens_bidding_with_exact_cap() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);

        ctx("v-geo.testnet", 0, t0 + 1 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 8800, 3, "d".repeat(64), None);

        let case = c.get_case("c1".into()).unwrap();
        assert_eq!(case.status, Status::Bidding);
        assert_eq!(case.tier, 3);
        // min(tier3=5000, 20% of 50000 = 10000, daily=25000) = 5000 USDC
        assert_eq!(case.cap.0, 5_000_000_000);

        // 4th verifier (red) can still record its vote before bids start
        ctx("v-red.testnet", 0, t0 + 4 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 7500, 0, "e".repeat(64), None);
        assert_eq!(c.get_votes("c1".into()).len(), 4);
    }

    #[test]
    fn tier_one_vote_rejects_with_zero_cap() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 2);

        ctx("v-geo.testnet", 0, t0 + NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 8000, 1, "d".repeat(64), None);

        let case = c.get_case("c1".into()).unwrap();
        assert_eq!(case.status, Status::Rejected);
        assert_eq!(case.cap.0, 0);
    }

    #[test]
    fn two_no_votes_reject_case() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);

        ctx("v-fact.testnet", 0, t0 + NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::No, 9500, 0, "b".repeat(64), None);
        ctx("v-red.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::No, 9200, 0, "c".repeat(64), None);

        let case = c.get_case("c1".into()).unwrap();
        assert_eq!(case.status, Status::Rejected);
    }

    #[test]
    fn split_vote_goes_to_needs_review_and_coordinator_confirms() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 2);

        ctx("v-geo.testnet", 0, t0 + NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 7000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Abstain, 5000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 6500, 2, "d".repeat(64), None);
        ctx("v-red.testnet", 0, t0 + 4 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::No, 6000, 0, "e".repeat(64), None);

        assert_eq!(c.get_case("c1".into()).unwrap().status, Status::NeedsReview);

        ctx("coord.testnet", 0, t0 + 5 * NANOS_PER_SEC);
        c.human_confirm("c1".into());

        let case = c.get_case("c1".into()).unwrap();
        assert_eq!(case.status, Status::Bidding);
        assert_eq!(case.cap.0, 2_000_000_000);
    }

    #[test]
    #[should_panic(expected = "no longer accepting verification votes")]
    fn vote_after_needs_review_is_rejected() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 2);

        ctx("v-geo.testnet", 0, t0 + NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 7000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Abstain, 5000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 6500, 2, "d".repeat(64), None);
        ctx("v-red.testnet", 0, t0 + 4 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::No, 6000, 0, "e".repeat(64), None);

        ctx("coord.testnet", 0, t0 + 5 * NANOS_PER_SEC);
        c.human_reject("c1".into());

        // Cannot vote again after coordinator decided
        ctx("v-geo.testnet", 0, t0 + 6 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "f".repeat(64), None);
    }

    #[test]
    #[should_panic(expected = "Wrong token")]
    fn wrong_token_donation_panics() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("evil-token.testnet", 0, t0);
        c.ft_on_transfer(acct("donor.testnet"), U128(1_000_000), "".into());
    }

    #[test]
    #[should_panic(expected = "exceeds case spending cap")]
    fn bid_above_cap_is_rejected() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 2);
        ctx("v-geo.testnet", 0, t0 + 1 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 2, "d".repeat(64), None);

        ctx("ngo-1.testnet", 0, t0 + 5 * NANOS_PER_SEC);
        c.place_bid("c1".into(), U128(2_000_000_001), 10, "p1".repeat(32), Some(true));
    }

    #[test]
    fn failed_tranche1_transfer_rolls_back_accounting_and_state() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);
        ctx("v-geo.testnet", 0, t0 + 1 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 3, "d".repeat(64), None);

        ctx("ngo-1.testnet", 0, t0 + 5 * NANOS_PER_SEC);
        c.place_bid("c1".into(), U128(3_000_000_000), 8, "p1".repeat(32), Some(true));
        ctx("ngo-2.testnet", 0, t0 + 6 * NANOS_PER_SEC);
        c.place_bid("c1".into(), U128(4_000_000_000), 6, "p2".repeat(32), Some(true));

        ctx("intake.testnet", 0, t0 + 10 * NANOS_PER_SEC);
        let _ = c.close_bidding("c1".into());
        assert_eq!(c.get_case("c1".into()).unwrap().status, Status::Awarded);
        assert_eq!(c.get_pool().balance.0, 48_800_000_000);
        assert_eq!(c.get_pool().reserved.0, 1_800_000_000);

        // Simulate failed ft_transfer promise callback
        let cb_ctx = VMContextBuilder::new()
            .current_account_id(acct("lifeline.testnet"))
            .predecessor_account_id(acct("lifeline.testnet"))
            .block_timestamp(t0 + 11 * NANOS_PER_SEC)
            .build();
        testing_env!(
            cb_ctx,
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            vec![PromiseResult::Failed],
        );

        let ok = c.on_tranche1_transfer(
            "c1".into(),
            acct("ngo-1.testnet"),
            U128(3_000_000_000),
            U128(1_200_000_000),
        );
        assert!(!ok);
        let restored = c.get_case("c1".into()).unwrap();
        assert_eq!(restored.status, Status::Bidding);
        assert_eq!(restored.winner, None);
        assert_eq!(restored.tranche1_paid.0, 0);
        assert_eq!(c.get_pool().balance.0, 50_000_000_000);
        assert_eq!(c.get_pool().reserved.0, 0);
        assert_eq!(c.get_pool().disbursed_today.0, 0);
    }

    #[test]
    fn bad_delivery_proof_allows_one_retry_then_expires_and_returns_escrow() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);
        ctx("v-geo.testnet", 0, t0 + 1 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 3, "d".repeat(64), None);

        ctx("ngo-1.testnet", 0, t0 + 5 * NANOS_PER_SEC);
        c.place_bid("c1".into(), U128(3_000_000_000), 8, "p1".repeat(32), Some(true));
        ctx("intake.testnet", 0, t0 + 10 * NANOS_PER_SEC);
        let _ = c.close_bidding("c1".into());
        c.payout_pending.remove("c1");

        // Attempt 1: bad proof -> 3 not-ok -> returns to Awarded (retry_count = 1)
        ctx("ngo-1.testnet", 0, t0 + 20 * NANOS_PER_SEC);
        c.submit_proof("c1".into(), "bad1".into(), "/api/evidence/bad1".into());

        for v in ["v-fact.testnet", "v-sev.testnet", "v-red.testnet"] {
            ctx(v, 0, t0 + 25 * NANOS_PER_SEC);
            let _ = c.vote_delivery("c1".into(), false, "r".repeat(64));
        }

        let after_first_reject = c.get_case("c1".into()).unwrap();
        assert_eq!(after_first_reject.status, Status::Awarded);
        assert_eq!(after_first_reject.delivery_retry_count, 1);

        // Attempt 2: bad proof again -> 3 not-ok -> Expired & escrow unreserved
        ctx("ngo-1.testnet", 0, t0 + 30 * NANOS_PER_SEC);
        c.submit_proof("c1".into(), "bad2".into(), "/api/evidence/bad2".into());

        for v in ["v-fact.testnet", "v-sev.testnet", "v-red.testnet"] {
            ctx(v, 0, t0 + 35 * NANOS_PER_SEC);
            let _ = c.vote_delivery("c1".into(), false, "r".repeat(64));
        }

        let after_second_reject = c.get_case("c1".into()).unwrap();
        assert_eq!(after_second_reject.status, Status::Expired);
        assert_eq!(c.get_pool().reserved.0, 0);
        let ngo = c.get_ngo(acct("ngo-1.testnet")).unwrap();
        assert_eq!(ngo.reputation, 80);
        assert_eq!(ngo.failed, 1);
    }

    #[test]
    fn expire_after_proof_deadline_unreserves_escrow_and_penalizes_ngo() {
        let mut c = setup_contract();
        let t0 = 1_700_000_000 * NANOS_PER_SEC;
        ctx("intake.testnet", 0, t0);
        c.submit_case("c1".into(), "s5ptx".into(), "a".repeat(64), 3);
        ctx("v-geo.testnet", 0, t0 + 1 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "b".repeat(64), None);
        ctx("v-fact.testnet", 0, t0 + 2 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 0, "c".repeat(64), None);
        ctx("v-sev.testnet", 0, t0 + 3 * NANOS_PER_SEC);
        c.vote("c1".into(), Verdict::Yes, 9000, 3, "d".repeat(64), None);

        ctx("ngo-1.testnet", 0, t0 + 5 * NANOS_PER_SEC);
        c.place_bid("c1".into(), U128(3_000_000_000), 8, "p1".repeat(32), Some(true));
        ctx("intake.testnet", 0, t0 + 10 * NANOS_PER_SEC);
        let _ = c.close_bidding("c1".into());
        c.payout_pending.remove("c1");

        // Advance past proof_deadline (300s)
        ctx("anyone.testnet", 0, t0 + 400 * NANOS_PER_SEC);
        c.expire("c1".into());

        assert_eq!(c.get_case("c1".into()).unwrap().status, Status::Expired);
        assert_eq!(c.get_pool().reserved.0, 0);
        assert_eq!(c.get_pool().available.0, 48_800_000_000);
        let ngo = c.get_ngo(acct("ngo-1.testnet")).unwrap();
        assert_eq!(ngo.reputation, 80);
        assert_eq!(ngo.failed, 1);
    }
}

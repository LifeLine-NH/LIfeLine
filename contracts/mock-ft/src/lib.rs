use near_sdk::json_types::U128;
use near_sdk::{
    env, ext_contract, near, require, serde_json, AccountId, Gas, NearToken, PanicOnDefault,
    PromiseOrValue, PromiseResult,
};
use std::collections::{BTreeMap, BTreeSet};

/// 0.00125 NEAR fixed storage deposit per registered token holder (NEP-145).
const STORAGE_PRICE_PER_ACCOUNT: u128 = 1_250_000_000_000_000_000_000;
const GAS_FOR_FT_ON_TRANSFER: Gas = Gas::from_tgas(40);
const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(15);

#[ext_contract(ext_ft_receiver)]
pub trait FungibleTokenReceiver {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128>;
}

#[ext_contract(ext_self)]
pub trait FtResolveTransfer {
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128;
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FungibleTokenMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageBalanceBounds {
    pub min: U128,
    pub max: Option<U128>,
}

/// TESTNET ONLY NEP-141 fungible token with NEP-145 storage management, NEP-148 metadata,
/// NEP-297 events, and a public `mint(to, amount)` faucet.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    pub owner_id: AccountId,
    pub total_supply: u128,
    pub balances: BTreeMap<AccountId, u128>,
    pub registered: BTreeSet<AccountId>,
    pub metadata: FungibleTokenMetadata,
}

#[near]
impl MockFt {
    /// Initializes the mock token with default 6-decimal USDC metadata (TESTNET ONLY).
    #[init]
    pub fn new_default_meta(owner_id: AccountId, total_supply: U128) -> Self {
        Self::new(
            owner_id,
            total_supply,
            FungibleTokenMetadata {
                spec: "ft-1.0.0".to_string(),
                name: "LifeLine Test USD Coin (TESTNET ONLY)".to_string(),
                symbol: "USDC".to_string(),
                icon: None,
                reference: None,
                reference_hash: None,
                decimals: 6,
            },
        )
    }

    /// Initializes the mock token with explicit NEP-148 metadata.
    #[init]
    pub fn new(
        owner_id: AccountId,
        total_supply: U128,
        metadata: FungibleTokenMetadata,
    ) -> Self {
        let mut balances = BTreeMap::new();
        let mut registered = BTreeSet::new();
        registered.insert(owner_id.clone());
        balances.insert(owner_id.clone(), total_supply.0);

        if total_supply.0 > 0 {
            emit_nep141_event(
                "ft_mint",
                serde_json::json!([{
                    "owner_id": owner_id,
                    "amount": total_supply,
                    "memo": "initial supply (TESTNET ONLY)"
                }]),
            );
        }

        Self {
            owner_id,
            total_supply: total_supply.0,
            balances,
            registered,
            metadata,
        }
    }

    /// TESTNET ONLY public faucet. Auto-registers `to` and mints `amount` tokens.
    pub fn mint(&mut self, to: AccountId, amount: U128) {
        require!(amount.0 > 0, "Mint amount must be positive");
        self.registered.insert(to.clone());
        let bal = self.balances.entry(to.clone()).or_insert(0);
        *bal = bal.checked_add(amount.0).expect("Balance overflow");
        self.total_supply = self
            .total_supply
            .checked_add(amount.0)
            .expect("Total supply overflow");

        emit_nep141_event(
            "ft_mint",
            serde_json::json!([{
                "owner_id": to,
                "amount": amount,
                "memo": "TESTNET ONLY faucet mint"
            }]),
        );
    }

    // ---- NEP-145 Storage Management ----

    #[payable]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        #[allow(unused_variables)] registration_only: Option<bool>,
    ) -> StorageBalance {
        let account = account_id.unwrap_or_else(env::predecessor_account_id);
        let attached = env::attached_deposit().as_yoctonear();

        if self.registered.contains(&account) {
            if attached > 0 {
                near_sdk::Promise::new(env::predecessor_account_id())
                    .transfer(NearToken::from_yoctonear(attached));
            }
            return StorageBalance {
                total: U128(STORAGE_PRICE_PER_ACCOUNT),
                available: U128(0),
            };
        }

        require!(
            attached >= STORAGE_PRICE_PER_ACCOUNT,
            "Insufficient storage deposit"
        );
        self.registered.insert(account.clone());
        self.balances.entry(account).or_insert(0);

        let refund = attached - STORAGE_PRICE_PER_ACCOUNT;
        if refund > 0 {
            near_sdk::Promise::new(env::predecessor_account_id())
                .transfer(NearToken::from_yoctonear(refund));
        }

        StorageBalance {
            total: U128(STORAGE_PRICE_PER_ACCOUNT),
            available: U128(0),
        }
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds {
            min: U128(STORAGE_PRICE_PER_ACCOUNT),
            max: Some(U128(STORAGE_PRICE_PER_ACCOUNT)),
        }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        if self.registered.contains(&account_id) {
            Some(StorageBalance {
                total: U128(STORAGE_PRICE_PER_ACCOUNT),
                available: U128(0),
            })
        } else {
            None
        }
    }

    // ---- NEP-141 Core & NEP-148 Metadata ----

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0, memo);
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0, memo);

        let receiver_gas = env::prepaid_gas()
            .saturating_sub(env::used_gas())
            .saturating_sub(GAS_FOR_RESOLVE_TRANSFER)
            .saturating_sub(Gas::from_tgas(10));
        let on_transfer_gas = if receiver_gas.as_gas() > GAS_FOR_FT_ON_TRANSFER.as_gas() {
            GAS_FOR_FT_ON_TRANSFER
        } else {
            receiver_gas
        };

        ext_ft_receiver::ext(receiver_id.clone())
            .with_static_gas(on_transfer_gas)
            .ft_on_transfer(sender_id.clone(), amount, msg)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE_TRANSFER)
                    .ft_resolve_transfer(sender_id, receiver_id, amount),
            )
            .into()
    }

    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let unused_amount = match env::promise_result(0) {
            PromiseResult::Successful(bytes) => match serde_json::from_slice::<U128>(&bytes) {
                Ok(unused) => std::cmp::min(amount.0, unused.0),
                Err(_) => amount.0,
            },
            PromiseResult::Failed => amount.0,
        };

        if unused_amount > 0 {
            let receiver_balance = self.balances.get(&receiver_id).copied().unwrap_or(0);
            let refund_amount = std::cmp::min(receiver_balance, unused_amount);
            if refund_amount > 0 {
                self.balances
                    .insert(receiver_id.clone(), receiver_balance - refund_amount);
                let sender_balance = self.balances.get(&sender_id).copied().unwrap_or(0);
                self.balances
                    .insert(sender_id.clone(), sender_balance + refund_amount);

                emit_nep141_event(
                    "ft_transfer",
                    serde_json::json!([{
                        "old_owner_id": receiver_id,
                        "new_owner_id": sender_id,
                        "amount": U128(refund_amount),
                        "memo": "refund"
                    }]),
                );
            }
            return U128(amount.0 - refund_amount);
        }

        amount
    }
}

impl MockFt {
    fn internal_transfer(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        amount: u128,
        memo: Option<String>,
    ) {
        require!(sender_id != receiver_id, "Sender and receiver should be different");
        require!(amount > 0, "The amount should be a positive number");
        require!(
            self.registered.contains(sender_id),
            format!("The account {sender_id} is not registered")
        );
        require!(
            self.registered.contains(receiver_id),
            format!("The account {receiver_id} is not registered")
        );

        let sender_balance = self.balances.get(sender_id).copied().unwrap_or(0);
        require!(sender_balance >= amount, "The account doesn't have enough balance");
        self.balances.insert(sender_id.clone(), sender_balance - amount);

        let receiver_balance = self.balances.get(receiver_id).copied().unwrap_or(0);
        self.balances.insert(
            receiver_id.clone(),
            receiver_balance.checked_add(amount).expect("Balance overflow"),
        );

        let mut entry = serde_json::json!({
            "old_owner_id": sender_id,
            "new_owner_id": receiver_id,
            "amount": U128(amount),
        });
        if let Some(m) = memo {
            entry["memo"] = serde_json::json!(m);
        }
        emit_nep141_event("ft_transfer", serde_json::json!([entry]));
    }
}

fn emit_nep141_event(event: &str, data: serde_json::Value) {
    let payload = serde_json::json!({
        "standard": "nep141",
        "version": "1.0.0",
        "event": event,
        "data": data,
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn acct(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn set_context(predecessor: AccountId, deposit: NearToken) {
        let ctx = VMContextBuilder::new()
            .predecessor_account_id(predecessor)
            .attached_deposit(deposit)
            .build();
        testing_env!(ctx);
    }

    #[test]
    fn initializes_metadata_and_mints() {
        set_context(acct("owner.testnet"), NearToken::from_yoctonear(0));
        let mut token = MockFt::new_default_meta(acct("owner.testnet"), U128(1_000_000));
        assert_eq!(token.ft_metadata().symbol, "USDC");
        assert_eq!(token.ft_metadata().decimals, 6);
        assert_eq!(token.ft_total_supply().0, 1_000_000);
        assert!(token.storage_balance_of(acct("donor.testnet")).is_none());

        token.mint(acct("donor.testnet"), U128(500_000));
        assert_eq!(token.ft_balance_of(acct("donor.testnet")).0, 500_000);
        assert_eq!(token.ft_total_supply().0, 1_500_000);
        assert!(token.storage_balance_of(acct("donor.testnet")).is_some());
    }

    #[test]
    fn storage_deposit_and_transfer_work() {
        set_context(acct("owner.testnet"), NearToken::from_yoctonear(0));
        let mut token = MockFt::new_default_meta(acct("owner.testnet"), U128(1_000_000));

        set_context(
            acct("alice.testnet"),
            NearToken::from_yoctonear(STORAGE_PRICE_PER_ACCOUNT),
        );
        let sb = token.storage_deposit(None, Some(true));
        assert_eq!(sb.total.0, STORAGE_PRICE_PER_ACCOUNT);
        assert!(token.storage_balance_of(acct("alice.testnet")).is_some());

        set_context(acct("owner.testnet"), NearToken::from_yoctonear(1));
        token.ft_transfer(acct("alice.testnet"), U128(250_000), None);
        assert_eq!(token.ft_balance_of(acct("alice.testnet")).0, 250_000);
        assert_eq!(token.ft_balance_of(acct("owner.testnet")).0, 750_000);
    }

    #[test]
    #[should_panic(expected = "is not registered")]
    fn transfer_to_unregistered_receiver_panics() {
        set_context(acct("owner.testnet"), NearToken::from_yoctonear(0));
        let mut token = MockFt::new_default_meta(acct("owner.testnet"), U128(1_000_000));

        set_context(acct("owner.testnet"), NearToken::from_yoctonear(1));
        token.ft_transfer(acct("unregistered.testnet"), U128(100_000), None);
    }
}

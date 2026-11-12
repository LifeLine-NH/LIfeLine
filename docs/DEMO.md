# Demo script

About two and a half minutes. Record the large screen view at 1600 × 900 and the case pages at normal desktop width. Everything below can be shown today on sample data; the transaction table at the end is filled in once the run happens on testnet.

## Before recording

1. `pnpm install`, then `pnpm dev` (or the hosted site once it is up).
2. Check the header badges. On testnet they read **Data Testnet** and **Agents Replay** or **Live**. On sample data they read **Data Sample data**, and that must stay visible in the video.
3. Open `/ops/stage` in one tab and `/cases` in another.
4. Turn off "reduce motion" in the operating system so the votes animate.

## Script

| Time | Screen | Say |
|---|---|---|
| 0:00 | Home page | "Disaster relief often depends on trusting whoever holds the money. Many automated systems check a report by looking for the word 'flood' in the report itself, so a liar who writes the right word gets paid." |
| 0:15 | `/ops/stage`, press **S2**, then **Run S2** | "Here is that attack: twelve reports repeating 'flood' in a dry area, and one hides an instruction telling the verifiers to vote yes. Four verifiers, each its own NEAR account, check it on their own." |
| 0:35 | Votes arrive | "Fact checks outside data: no rain, no alert, no reports. The red team catches the hidden instruction. Two no votes are enough, and the contract rejects it. No money is reserved." |
| 0:50 | Press **S3**, **Run S3** | "Thirty reports from one sender. Geo, which uses no AI, sees one source posing as many. Rejected." |
| 1:00 | Press **S1**, **Run S1** | "A genuine report, modelled on the 2024 Alau Dam flood. Four yes votes. The contract caps spending at the lowest of the tier limit, a share of the pool and the daily limit left." |
| 1:20 | After the decision: bids, award, proof, second payment | "Simulated NGOs bid. The lowest ask wins and gets 40% at once. The rest waits until the verifiers agree the delivery really happened." |
| 1:35 | Press **S5**, **Run S5** | "Here the NGO claims 50,000 households against a plan of 600. The verifiers say it doesn't add up, and the second payment stays in the pool." |
| 1:50 | `/cases`, open the S1 case, scroll to a vote card, press **Check hash** | "Every vote links to its transaction. Evidence stays off chain to protect the people who reported, but its hash is on chain, and your browser can recompute it." |
| 2:05 | Payout card on the same case, **Get a live quote** to Base | "The responder can take the payment as USDC on another chain through NEAR Intents. This is a live quote; nothing moves." |
| 2:15 | Header badges, then the README's "What is real" table | "To be clear about the demo: our team runs all four verifier keys, the NGOs are bots, and replay mode uses recorded inputs. The rules and the checks are real." |
| 2:25 | Repository and site address | "LifeLine, built at NEAR HACKATHON 2026. The code and the contract are linked below." |

## Transactions from the recorded testnet run

Fill this in after recording on testnet, so judges can open each step on the explorer.

| Step | Scenario | Transaction |
|---|---|---|
| Case submitted | S2 | |
| Geo vote | S2 | |
| Fact vote | S2 | |
| Severity vote | S2 | |
| Red team vote | S2 | |
| Case submitted | S1 | |
| Four votes | S1 | |
| Award and first payment | S1 | |
| Proof submitted | S1 | |
| Second payment | S1 | |
| Delivery check failed, payment withheld | S5 | |

Relief contract account: (to add)

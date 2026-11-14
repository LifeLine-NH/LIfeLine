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

Recorded on `lifeline-demo.testnet` (14 Nov 2026). Every link opens the transaction on NearBlocks Testnet.

| Scenario | Case ID | Step | Transaction |
|---|---|---|---|
| S2 | `s4nh7-2025-01-15-001-s2` | Case submitted (`submit_case`) | [`CY2aGawitn…`](https://testnet.nearblocks.io/txns/CY2aGawitnUeaLpqoD1qGSfyC3uZKsnUuhF3i9Xyrpse) |
| S2 | `s4nh7-2025-01-15-001-s2` | geo vote (`Yes`) | [`FaGqFEG2vy…`](https://testnet.nearblocks.io/txns/FaGqFEG2vyBpxrJWgJqMrkFJ1jtu4wr54VA3FaWJTrMx) |
| S2 | `s4nh7-2025-01-15-001-s2` | fact vote (`No`) | [`GEzkieuPuE…`](https://testnet.nearblocks.io/txns/GEzkieuPuEBNWuH8jBEV2vfKp1FDG8VZxKCNWXFMSZVx) |
| S2 | `s4nh7-2025-01-15-001-s2` | sev vote (`No`) | [`6p2mEJUb3t…`](https://testnet.nearblocks.io/txns/6p2mEJUb3tGFm8MKzjuezz75RNUB5q3BgnCkYsSBQPpw) |
| S2 | `s4nh7-2025-01-15-001-s2` | red vote (`No`) | [`Hg6swH4pGu…`](https://testnet.nearblocks.io/txns/Hg6swH4pGuj4JAkfXTBVjxtSsn7qVH7CX2cAQ86zU3Ke) |
| S3 | `s1t7d-2025-02-01-001-s3` | Case submitted (`submit_case`) | [`8b73AXoYZB…`](https://testnet.nearblocks.io/txns/8b73AXoYZBmrCS6dQBvP7eY9Z5qMjQXQ5KSQenjyioxt) |
| S3 | `s1t7d-2025-02-01-001-s3` | geo vote (`No`) | [`9r7ezuYPnq…`](https://testnet.nearblocks.io/txns/9r7ezuYPnqC4N6SPkLzBaip7qtU1zWppLGtBTC482u5K) |
| S3 | `s1t7d-2025-02-01-001-s3` | fact vote (`No`) | [`5G3F5WPoiu…`](https://testnet.nearblocks.io/txns/5G3F5WPoiu8X9XMLXRKHmDgNoSDqkf5YTzVHN8gs3dDC) |
| S3 | `s1t7d-2025-02-01-001-s3` | sev vote (`No`) | [`Dmxwh5Zmcc…`](https://testnet.nearblocks.io/txns/Dmxwh5ZmccDw2efqvC8C9536FL93faWQ5YfAaQnpKbGr) |
| S3 | `s1t7d-2025-02-01-001-s3` | red vote (`No`) | [`NXQwjwJXLH…`](https://testnet.nearblocks.io/txns/NXQwjwJXLHyguzoek7gD168dK6z9DXhkyNnCX12SDNt) |
| S1 | `s6177-2024-09-10-002-s1` | Case submitted (`submit_case`) | [`8kzbe2aY3p…`](https://testnet.nearblocks.io/txns/8kzbe2aY3pvj7pwh56uLLZRb3zuKMPCgSpZXEUuqjJ7e) |
| S1 | `s6177-2024-09-10-002-s1` | geo vote (`Yes`) | [`4oFmsmJxG3…`](https://testnet.nearblocks.io/txns/4oFmsmJxG33tpawwYD9QUxqPHSqnUGNW5gCK9KjMtoXF) |
| S1 | `s6177-2024-09-10-002-s1` | fact vote (`Yes`) | [`8efduh5UHn…`](https://testnet.nearblocks.io/txns/8efduh5UHnkc5oo3FU3TiJAUT9kH4V5v23cL7gn2gxf7) |
| S1 | `s6177-2024-09-10-002-s1` | sev vote (`Yes`) | [`8JrrYTi4YG…`](https://testnet.nearblocks.io/txns/8JrrYTi4YGiWeUEVf41Tgt74tVSiCDN8W872gckcNfwM) |
| S1 | `s6177-2024-09-10-002-s1` | red vote (`Yes`) | [`CySrCa7Xrf…`](https://testnet.nearblocks.io/txns/CySrCa7XrfeCL7H5WZQvSQt28EJGMzsYt8L9ieJWe3vD) |
| S1 | `s6177-2024-09-10-002-s1` | Bid (ngo-rapid) | [`DnbDgUgN63…`](https://testnet.nearblocks.io/txns/DnbDgUgN63u5JoVAnPHb1D5phars6LFMSYLExds2yrYm) |
| S1 | `s6177-2024-09-10-002-s1` | Bid (ngo-balanced) | [`AfbTxbRNUd…`](https://testnet.nearblocks.io/txns/AfbTxbRNUdT3NPpfg75qxJsSfjiJN9aPHAe5hgFbLiWw) |
| S1 | `s6177-2024-09-10-002-s1` | Bid (ngo-frugal) | [`Dwq8yR8XZm…`](https://testnet.nearblocks.io/txns/Dwq8yR8XZmM1WcqA2VhUpHNxu58rD4f71yGTLLe1tJkc) |
| S1 | `s6177-2024-09-10-002-s1` | Award & Tranche 1 (`close_bidding`) | [`Hcx47B7tUw…`](https://testnet.nearblocks.io/txns/Hcx47B7tUwnoZFUj15FvV7NLec6Tw3rEXCm42YpGvxws) |
| S1 | `s6177-2024-09-10-002-s1` | Delivery proof (`submit_proof`) | [`Hj2wEgbDL5…`](https://testnet.nearblocks.io/txns/Hj2wEgbDL5yBaLdw1eFSGNEDkcjjTxPXtQ6XMRQZuvcA) |
| S1 | `s6177-2024-09-10-002-s1` | Delivery vote (geo: ok) | [`CzPHWaHeao…`](https://testnet.nearblocks.io/txns/CzPHWaHeaoAEasWQwx2dArUm2Uf99uo8TCUHCMiaqfWT) |
| S1 | `s6177-2024-09-10-002-s1` | Delivery vote (fact: ok) | [`G3pxPWmXrB…`](https://testnet.nearblocks.io/txns/G3pxPWmXrBjWmC1vHzhnN9CLH8PUAGiBqmJmUjStFR5s) |
| S1 | `s6177-2024-09-10-002-s1` | Delivery vote (sev: ok) | [`3PHB4mzYCT…`](https://testnet.nearblocks.io/txns/3PHB4mzYCTc7kMBnVEXbtfpYU2Jdx56DGwouWz29NFix) |
| S1 | `s6177-2024-09-10-002-s1` | Delivery vote (red: ok) | [`4RuLcnuirN…`](https://testnet.nearblocks.io/txns/4RuLcnuirNK9tpvQQYuW7KjB7VGKyw4uoPf77Z5VTXqu) |
| S5 | `s6177-2024-09-10-001-s5` | Case submitted (`submit_case`) | [`s65Q5VAUBv…`](https://testnet.nearblocks.io/txns/s65Q5VAUBvk3ypXRi1vmYW2x9XZzq5ys858eoDbz9RL) |
| S5 | `s6177-2024-09-10-001-s5` | geo vote (`Yes`) | [`J6Q3P25N7R…`](https://testnet.nearblocks.io/txns/J6Q3P25N7RbteopGYoGRR1it5xwE6NFmvBVdNXwW7nXR) |
| S5 | `s6177-2024-09-10-001-s5` | fact vote (`Yes`) | [`ErFsfndRq1…`](https://testnet.nearblocks.io/txns/ErFsfndRq1JJkZ7T2TrxXEFMqg6pczcvu7TYTCyWk4Sg) |
| S5 | `s6177-2024-09-10-001-s5` | sev vote (`Yes`) | [`9JUpo6Bg2V…`](https://testnet.nearblocks.io/txns/9JUpo6Bg2VMDnCqT5WZqt8Stp5WGteHKizScc4NuzrMd) |
| S5 | `s6177-2024-09-10-001-s5` | red vote (`Yes`) | [`33Cq8j74ke…`](https://testnet.nearblocks.io/txns/33Cq8j74keKLhmW8HJWjvR7MFTtsCEtCCLDdr8x61EBC) |
| S5 | `s6177-2024-09-10-001-s5` | Bid (ngo-rapid) | [`ENrFceF2bb…`](https://testnet.nearblocks.io/txns/ENrFceF2bbWkucp3Yf2UtHyLehq6WMjrxmkjc95biCBg) |
| S5 | `s6177-2024-09-10-001-s5` | Bid (ngo-balanced) | [`H48Ay5ExU8…`](https://testnet.nearblocks.io/txns/H48Ay5ExU8H5xorGgWVUJwTvgR3uhhL3TJwrfKMtY4N) |
| S5 | `s6177-2024-09-10-001-s5` | Bid (ngo-frugal) | [`9AJjyWcYWx…`](https://testnet.nearblocks.io/txns/9AJjyWcYWxoBYo61pYEZ3tacifDvC1kedjXr4T6BSf3s) |
| S5 | `s6177-2024-09-10-001-s5` | Award & Tranche 1 (`close_bidding`) | [`CAULFDzV53…`](https://testnet.nearblocks.io/txns/CAULFDzV53ewtQD3rZF2NQSqotxJMJYcTtieYhkCpbjw) |
| S5 | `s6177-2024-09-10-001-s5` | Delivery proof (`submit_proof`) | [`5ZEw7CfZJ9…`](https://testnet.nearblocks.io/txns/5ZEw7CfZJ9j6w3R9sZB61uHdbKyum5MAYFYVrJz2y7kM) |
| S5 | `s6177-2024-09-10-001-s5` | Delivery vote (geo: reject) | [`9TVGyEswGa…`](https://testnet.nearblocks.io/txns/9TVGyEswGa3vujJiJq9DXAcNkKNZ2YazCjXMxRHCaZ13) |
| S5 | `s6177-2024-09-10-001-s5` | Delivery vote (fact: reject) | [`28Gty892ht…`](https://testnet.nearblocks.io/txns/28Gty892htf6MEK1eVejbJPCbpz4iufDh96o17DGqWj4) |
| S5 | `s6177-2024-09-10-001-s5` | Delivery vote (sev: reject) | [`Er86DzeeWD…`](https://testnet.nearblocks.io/txns/Er86DzeeWDsiRb9mzsAPNsNWYdptaLBXBm1jeXu3D3fi) |
| S5 | `s6177-2024-09-10-001-s5` | Delivery vote (red: reject) | [`7dAeiCh8SA…`](https://testnet.nearblocks.io/txns/7dAeiCh8SA2SKzjmUyaEMaXxjFd5orKVCJsugNc3WYeK) |

Relief contract account: [`lifeline-demo.testnet`](https://testnet.nearblocks.io/address/lifeline-demo.testnet)

# Benchmark Report

Generated at: 2026-05-23T04:25:04.089Z

## Key Findings

- fixed_cheap-rollup achieved the best average rank across the full matrix, indicating the strongest overall balance between route availability, completion rate, cost, and latency.
- fixed_cheap-rollup minimized average fee, while fixed_fast-rollup delivered the lowest latency profile, highlighting the expected cost-speed trade-off.
- reliable achieved the highest average completion rate, and dynamic policies won 6 of 12 experiment cells overall, especially normal/merchant_batches, normal/mixed_orderflow, burst/retail_payments, burst/strict_output_protection.

## Dynamic Vs Static Summary

Dynamic winners: 6 / 12 experiments.

Static winners: 6 / 12 experiments.

Dynamic-winning cells: normal/merchant_batches, normal/mixed_orderflow, burst/retail_payments, burst/strict_output_protection, burst/mixed_orderflow, stress/strict_output_protection.

## Aggregate Policy Ranking

| Policy | Type | Avg Rank | 1st Places | Avg Score | Avg Fee (USD) | Avg P95 Latency (ms) | Avg Valid Route Rate | Avg Completion |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fixed_cheap-rollup | static | 2.75 | 6 | 0.8132 | 0.6375 | 9912 | 98% | 87% |
| cheapest | dynamic | 2.833 | 3 | 0.8088 | 0.6547 | 10082 | 100% | 86% |
| balanced | dynamic | 3.167 | 3 | 0.7665 | 0.9703 | 9060 | 100% | 90% |
| reliable | dynamic | 3.75 | 0 | 0.7625 | 1.5469 | 5290 | 100% | 94% |
| fastest | dynamic | 4.25 | 0 | 0.7392 | 1.579 | 3732 | 100% | 92% |
| fixed_fast-rollup | static | 4.25 | 0 | 0.7317 | 1.6024 | 3211 | 97% | 89% |
| fixed_congested-rollup | static | 7 | 0 | 0.1055 | 1.1177 | 19611 | 64% | 43% |

## Normal Load / Retail Payments

Small and medium transfer intents with moderate output protection.

Highlights: overall winner `fixed_cheap-rollup`, best dynamic `reliable`, best static `fixed_cheap-rollup`, cheapest `balanced`, fastest `fastest`, highest completion `reliable`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | fixed_cheap-rollup | static | 100% | 97% | 0.3774 | 7787 | 9222 | cheap-rollup | 0.7528 |
| 2 | reliable | dynamic | 100% | 100% | 1.3068 | 2965 | 6732 | fast-rollup | 0.6671 |
| 3 | cheapest | dynamic | 100% | 88% | 0.3787 | 7755 | 9077 | cheap-rollup | 0.5543 |
| 4 | fixed_fast-rollup | static | 100% | 91% | 1.3799 | 2800 | 3121 | fast-rollup | 0.4991 |
| 5 | balanced | dynamic | 100% | 84% | 0.3715 | 8069 | 9349 | cheap-rollup | 0.4857 |
| 6 | fastest | dynamic | 100% | 84% | 1.3666 | 2684 | 3045 | fast-rollup | 0.3694 |
| 7 | fixed_congested-rollup | static | 100% | 81% | 0.7666 | 16184 | 18596 | congested-rollup | 0.2216 |

## Normal Load / Merchant Settlement

Larger transfer-and-execute intents that prioritize dependable completion.

Highlights: overall winner `cheapest`, best dynamic `cheapest`, best static `fixed_fast-rollup`, cheapest `cheapest`, fastest `fixed_fast-rollup`, highest completion `fastest`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | cheapest | dynamic | 100% | 96% | 0.4712 | 7953 | 8857 | cheap-rollup | 0.7702 |
| 2 | fastest | dynamic | 100% | 100% | 1.5959 | 2752 | 3124 | fast-rollup | 0.7023 |
| 3 | fixed_fast-rollup | static | 100% | 100% | 1.6143 | 2725 | 3051 | fast-rollup | 0.7 |
| 4 | fixed_cheap-rollup | static | 100% | 88% | 0.4804 | 7862 | 8730 | cheap-rollup | 0.656 |
| 5 | balanced | dynamic | 100% | 88% | 0.5222 | 7506 | 9043 | cheap-rollup | 0.6447 |
| 6 | reliable | dynamic | 100% | 92% | 1.4651 | 3324 | 7408 | fast-rollup | 0.5574 |
| 7 | fixed_congested-rollup | static | 100% | 71% | 0.9066 | 16095 | 19044 | congested-rollup | 0.2238 |

## Normal Load / Strict Output Protection

Transfer intents with tight output guarantees that invalidate weaker routes.

Highlights: overall winner `fixed_cheap-rollup`, best dynamic `cheapest`, best static `fixed_cheap-rollup`, cheapest `fixed_cheap-rollup`, fastest `fastest`, highest completion `reliable`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | fixed_cheap-rollup | static | 100% | 96% | 0.4105 | 7890 | 9222 | cheap-rollup | 0.8847 |
| 2 | cheapest | dynamic | 100% | 89% | 0.4122 | 7792 | 9077 | cheap-rollup | 0.856 |
| 3 | reliable | dynamic | 100% | 100% | 1.4031 | 2872 | 3114 | fast-rollup | 0.8098 |
| 4 | fixed_fast-rollup | static | 100% | 89% | 1.4603 | 2815 | 3121 | fast-rollup | 0.7526 |
| 5 | fastest | dynamic | 100% | 86% | 1.4385 | 2691 | 3045 | fast-rollup | 0.7426 |
| 6 | balanced | dynamic | 100% | 93% | 1.3661 | 3024 | 6310 | fast-rollup | 0.7344 |
| 7 | fixed_congested-rollup | static | 7% | 7% | 0.7501 | 14690 | 15412 | congested-rollup | 0.1353 |

## Normal Load / Mixed Order Flow

A mixed workload combining simple transfers and transfer-and-execute intents.

Highlights: overall winner `cheapest`, best dynamic `cheapest`, best static `fixed_cheap-rollup`, cheapest `balanced`, fastest `fastest`, highest completion `reliable`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | cheapest | dynamic | 100% | 97% | 0.4118 | 7837 | 9097 | cheap-rollup | 0.7714 |
| 2 | fixed_cheap-rollup | static | 100% | 94% | 0.4121 | 7807 | 9222 | cheap-rollup | 0.7197 |
| 3 | reliable | dynamic | 100% | 100% | 1.3963 | 2902 | 6732 | fast-rollup | 0.6624 |
| 4 | balanced | dynamic | 100% | 83% | 0.4069 | 7962 | 9349 | cheap-rollup | 0.5191 |
| 5 | fastest | dynamic | 100% | 89% | 1.4405 | 2734 | 3045 | fast-rollup | 0.5012 |
| 6 | fixed_fast-rollup | static | 100% | 89% | 1.4468 | 2751 | 3121 | fast-rollup | 0.499 |
| 7 | fixed_congested-rollup | static | 100% | 78% | 0.8098 | 16001 | 18646 | congested-rollup | 0.2225 |

## Bursty Congestion / Retail Payments

Small and medium transfer intents with moderate output protection.

Highlights: overall winner `balanced`, best dynamic `balanced`, best static `fixed_fast-rollup`, cheapest `fixed_cheap-rollup`, fastest `fixed_fast-rollup`, highest completion `fixed_fast-rollup`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | balanced | dynamic | 100% | 91% | 0.6651 | 7937 | 10034 | cheap-rollup | 0.8603 |
| 2 | fixed_fast-rollup | static | 100% | 94% | 1.5097 | 2833 | 3223 | fast-rollup | 0.8056 |
| 3 | cheapest | dynamic | 100% | 84% | 0.5582 | 8896 | 10065 | cheap-rollup | 0.8017 |
| 4 | reliable | dynamic | 100% | 91% | 1.5328 | 2836 | 3412 | fast-rollup | 0.7588 |
| 5 | fastest | dynamic | 100% | 91% | 1.5372 | 2882 | 3345 | fast-rollup | 0.7587 |
| 6 | fixed_cheap-rollup | static | 100% | 78% | 0.5532 | 8945 | 10344 | cheap-rollup | 0.7195 |
| 7 | fixed_congested-rollup | static | 97% | 63% | 1.1507 | 17939 | 20907 | congested-rollup | 0.0786 |

## Bursty Congestion / Merchant Settlement

Larger transfer-and-execute intents that prioritize dependable completion.

Highlights: overall winner `fixed_cheap-rollup`, best dynamic `balanced`, best static `fixed_cheap-rollup`, cheapest `cheapest`, fastest `fastest`, highest completion `fixed_fast-rollup`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | fixed_cheap-rollup | static | 100% | 96% | 0.6644 | 8924 | 9743 | cheap-rollup | 0.8888 |
| 2 | balanced | dynamic | 100% | 92% | 0.7391 | 8292 | 9880 | cheap-rollup | 0.8404 |
| 3 | fixed_fast-rollup | static | 100% | 100% | 1.7516 | 2780 | 3118 | fast-rollup | 0.8 |
| 4 | reliable | dynamic | 100% | 100% | 1.754 | 2788 | 3183 | fast-rollup | 0.7988 |
| 5 | cheapest | dynamic | 100% | 83% | 0.6562 | 9062 | 10907 | cheap-rollup | 0.777 |
| 6 | fastest | dynamic | 100% | 96% | 1.7518 | 2726 | 3078 | fast-rollup | 0.767 |
| 7 | fixed_congested-rollup | static | 96% | 50% | 1.3015 | 18524 | 20545 | congested-rollup | 0.0824 |

## Bursty Congestion / Strict Output Protection

Transfer intents with tight output guarantees that invalidate weaker routes.

Highlights: overall winner `balanced`, best dynamic `balanced`, best static `fixed_fast-rollup`, cheapest `fixed_cheap-rollup`, fastest `fixed_fast-rollup`, highest completion `balanced`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | balanced | dynamic | 100% | 96% | 1.5479 | 3010 | 3491 | fast-rollup | 0.9999 |
| 2 | fastest | dynamic | 100% | 93% | 1.5717 | 3085 | 3462 | fast-rollup | 0.9851 |
| 3 | reliable | dynamic | 100% | 93% | 1.5684 | 3009 | 3412 | fast-rollup | 0.9851 |
| 4 | fixed_fast-rollup | static | 96% | 89% | 1.5852 | 2820 | 3223 | fast-rollup | 0.9632 |
| 5 | cheapest | dynamic | 100% | 82% | 0.5917 | 8922 | 10065 | cheap-rollup | 0.9394 |
| 6 | fixed_cheap-rollup | static | 100% | 82% | 0.5876 | 8891 | 10344 | cheap-rollup | 0.9393 |
| 7 | fixed_congested-rollup | static | 0% | 0% | 9999 | 999999 | 999999 | none | 0 |

## Bursty Congestion / Mixed Order Flow

A mixed workload combining simple transfers and transfer-and-execute intents.

Highlights: overall winner `cheapest`, best dynamic `cheapest`, best static `fixed_fast-rollup`, cheapest `cheapest`, fastest `fastest`, highest completion `fixed_fast-rollup`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | cheapest | dynamic | 100% | 92% | 0.5908 | 8898 | 10080 | cheap-rollup | 0.8859 |
| 2 | balanced | dynamic | 100% | 89% | 0.7248 | 7916 | 9940 | cheap-rollup | 0.8248 |
| 3 | fixed_fast-rollup | static | 100% | 94% | 1.5828 | 2818 | 3223 | fast-rollup | 0.8051 |
| 4 | fixed_cheap-rollup | static | 100% | 83% | 0.5949 | 8968 | 10344 | cheap-rollup | 0.773 |
| 5 | fastest | dynamic | 100% | 92% | 1.5995 | 2831 | 3188 | fast-rollup | 0.7659 |
| 6 | reliable | dynamic | 100% | 86% | 1.6106 | 2830 | 3412 | fast-rollup | 0.6884 |
| 7 | fixed_congested-rollup | static | 97% | 64% | 1.1938 | 18087 | 20907 | congested-rollup | 0.0817 |

## Stress Conditions / Retail Payments

Small and medium transfer intents with moderate output protection.

Highlights: overall winner `fixed_cheap-rollup`, best dynamic `cheapest`, best static `fixed_cheap-rollup`, cheapest `fixed_cheap-rollup`, fastest `fixed_fast-rollup`, highest completion `reliable`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | fixed_cheap-rollup | static | 100% | 88% | 0.8498 | 9395 | 10625 | cheap-rollup | 0.8418 |
| 2 | cheapest | dynamic | 100% | 81% | 0.8554 | 9345 | 11175 | cheap-rollup | 0.7977 |
| 3 | balanced | dynamic | 100% | 97% | 1.2572 | 5899 | 10360 | fast-rollup | 0.7974 |
| 4 | fixed_fast-rollup | static | 100% | 94% | 1.6415 | 2902 | 3207 | fast-rollup | 0.7653 |
| 5 | fastest | dynamic | 100% | 91% | 1.6482 | 2950 | 3294 | fast-rollup | 0.7445 |
| 6 | reliable | dynamic | 100% | 100% | 1.6011 | 3285 | 9239 | fast-rollup | 0.7423 |
| 7 | fixed_congested-rollup | static | 53% | 31% | 1.377 | 17967 | 20565 | congested-rollup | 0.0679 |

## Stress Conditions / Merchant Settlement

Larger transfer-and-execute intents that prioritize dependable completion.

Highlights: overall winner `fixed_cheap-rollup`, best dynamic `cheapest`, best static `fixed_cheap-rollup`, cheapest `fixed_cheap-rollup`, fastest `fastest`, highest completion `fastest`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | fixed_cheap-rollup | static | 100% | 92% | 0.9679 | 9115 | 10252 | cheap-rollup | 0.8685 |
| 2 | cheapest | dynamic | 100% | 92% | 0.9831 | 9047 | 10353 | cheap-rollup | 0.8641 |
| 3 | fastest | dynamic | 100% | 100% | 1.8723 | 2877 | 3118 | fast-rollup | 0.8 |
| 4 | reliable | dynamic | 100% | 83% | 1.8311 | 3140 | 3673 | fast-rollup | 0.6963 |
| 5 | balanced | dynamic | 100% | 79% | 1.3799 | 6433 | 10540 | cheap-rollup | 0.6943 |
| 6 | fixed_fast-rollup | static | 100% | 79% | 1.8685 | 2992 | 3429 | fast-rollup | 0.6641 |
| 7 | fixed_congested-rollup | static | 54% | 38% | 1.4982 | 18765 | 21374 | congested-rollup | 0.0827 |

## Stress Conditions / Strict Output Protection

Transfer intents with tight output guarantees that invalidate weaker routes.

Highlights: overall winner `balanced`, best dynamic `balanced`, best static `fixed_cheap-rollup`, cheapest `fixed_cheap-rollup`, fastest `fixed_fast-rollup`, highest completion `balanced`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | balanced | dynamic | 96% | 96% | 1.3808 | 5132 | 9881 | fast-rollup | 0.9987 |
| 2 | reliable | dynamic | 96% | 93% | 1.3843 | 5182 | 9829 | fast-rollup | 0.9839 |
| 3 | fastest | dynamic | 96% | 86% | 1.4165 | 5028 | 9750 | fast-rollup | 0.9542 |
| 4 | cheapest | dynamic | 96% | 79% | 1.0437 | 7856 | 11059 | cheap-rollup | 0.9243 |
| 5 | fixed_cheap-rollup | static | 75% | 64% | 0.8624 | 9385 | 10304 | cheap-rollup | 0.8208 |
| 6 | fixed_fast-rollup | static | 64% | 61% | 1.6907 | 2874 | 3207 | fast-rollup | 0.7852 |
| 7 | fixed_congested-rollup | static | 0% | 0% | 9999 | 999999 | 999999 | none | 0 |

## Stress Conditions / Mixed Order Flow

A mixed workload combining simple transfers and transfer-and-execute intents.

Highlights: overall winner `fixed_cheap-rollup`, best dynamic `reliable`, best static `fixed_cheap-rollup`, cheapest `fixed_cheap-rollup`, fastest `fastest`, highest completion `reliable`.

| Rank | Policy | Type | Valid Route Rate | Completion Rate | Avg Fee (USD) | Avg Latency (ms) | P95 Latency (ms) | Dominant Route | Score |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | fixed_cheap-rollup | static | 100% | 92% | 0.8899 | 9284 | 10587 | cheap-rollup | 0.8933 |
| 2 | reliable | dynamic | 100% | 94% | 1.7086 | 2861 | 3336 | fast-rollup | 0.7998 |
| 3 | balanced | dynamic | 100% | 92% | 1.282 | 6123 | 10540 | fast-rollup | 0.7983 |
| 4 | fastest | dynamic | 100% | 92% | 1.7099 | 2894 | 3294 | fast-rollup | 0.7801 |
| 5 | cheapest | dynamic | 100% | 75% | 0.903 | 9430 | 11175 | cheap-rollup | 0.7631 |
| 6 | fixed_fast-rollup | static | 100% | 86% | 1.697 | 2917 | 3484 | fast-rollup | 0.7409 |
| 7 | fixed_congested-rollup | static | 69% | 39% | 1.423 | 18129 | 20115 | congested-rollup | 0.07 |

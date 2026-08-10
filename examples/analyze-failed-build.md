# Example: triaging a failed build

*All data in this example is fictional — a made-up company (BrightCart), made-up
build configuration, commit, and test names. It illustrates the shape of tool
responses and the resulting report, not a real incident.*

## Scenario

A QA engineer opens Claude Code with the MCP server connected
(`TEAMCITY_BUILD_TYPE_ID=BrightCart_Checkout_ApiTests`) and asks:

> Why did the last build fail?

## What the AI does

**1. Find the target build.**

```
list_recent_builds({ limit: 3, status: "FAILURE" })
```

```json
{
  "ok": true,
  "data": [
    {
      "buildId": 48213,
      "buildNumber": "1042",
      "status": "FAILURE",
      "state": "finished",
      "buildTypeId": "BrightCart_Checkout_ApiTests",
      "startDate": "20260706T091203+0000",
      "finishDate": "20260706T091845+0000",
      "webUrl": "https://ci.brightcart.example/viewLog.html?buildId=48213"
    }
  ]
}
```

**2. Pull the one-call analysis context.**

```
get_failed_build_analysis_context({ buildId: 48213 })
```

```json
{
  "ok": true,
  "data": {
    "build": { "buildId": 48213, "buildNumber": "1042", "status": "FAILURE" },
    "problems": [],
    "failureClusters": [
      {
        "rootCause": "AssertionError: expected discount 10.00 but was 0.00",
        "exceptionType": "AssertionError",
        "count": 6,
        "testNames": [
          "CheckoutDiscountTests.appliesPercentageDiscount",
          "CheckoutDiscountTests.appliesFixedAmountDiscount",
          "CheckoutDiscountTests.stacksDiscountWithCoupon"
        ]
      },
      {
        "rootCause": "AssertionError: expected status 200 but was 500",
        "exceptionType": "AssertionError",
        "count": 1,
        "testNames": ["CheckoutShippingTests.calculatesInternationalShipping"]
      }
    ],
    "totalFailedTests": 7,
    "clusterCount": 2,
    "changes": [
      {
        "id": 91824,
        "version": "a3f9c21",
        "username": "dev.morgan",
        "date": "20260706T084501+0000",
        "comment": "Refactor discount calculation to support stacked coupons",
        "files": [{ "path": "src/checkout/DiscountCalculator.java", "changeType": "edited" }]
      }
    ],
    "logExcerpt": { "available": true, "totalLines": 4102, "excerptLines": 200, "tail": "...", "errorWindows": [] },
    "comparisonWithPreviousGreen": {
      "baselineBuildId": 48198,
      "baselineBuildNumber": "1041",
      "newFailures": 6,
      "fixedTests": 0,
      "sameFailures": 1,
      "missingTests": 0,
      "newTests": 0
    }
  }
}
```

**3. Reasoning.** Six of seven failures cluster on one root cause
(`AssertionError: expected discount ... but was 0.00`), all in
`CheckoutDiscountTests`. The one change in this build touches
`DiscountCalculator.java` — the exact area the failing tests exercise — and
`comparisonWithPreviousGreen` confirms these six failures are new (they were
passing in build #1041). The seventh failure (`CheckoutShippingTests`,
different area, `sameFailures: 1`) is unrelated and was already failing
before this change.

## Resulting report (abridged)

> ## Summary
> Build #1042 failed with 7 test failures. 6 are new and trace to today's
> discount-calculation refactor; 1 is a pre-existing, unrelated shipping
> failure.
>
> ## Failure Groups
> ### Group 1: Discount calculation returns 0.00
> - **Tests affected:** 6
> - **Representative test:** `CheckoutDiscountTests.appliesPercentageDiscount`
> - **Error pattern:** `AssertionError: expected discount 10.00 but was 0.00`
> - **New or recurring:** new (absent in build #1041)
> - **Flaky suspicion:** no — deterministic failure across all 6 tests
>
> ### Group 2: International shipping 500 error
> - **Tests affected:** 1
> - **Representative test:** `CheckoutShippingTests.calculatesInternationalShipping`
> - **New or recurring:** recurring (present in build #1041 too)
>
> ## Recent Changes
> `a3f9c21` (dev.morgan): "Refactor discount calculation to support stacked
> coupons" — touches `DiscountCalculator.java`, the same area as Group 1.
>
> ## What to Check First
> 1. Review `a3f9c21` — the stacked-coupon refactor likely broke the base
>    percentage/fixed-discount paths.
> 2. The shipping failure (Group 2) is pre-existing — track separately, not
>    blocking for this change.

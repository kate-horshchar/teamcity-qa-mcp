# Example: multi-config failure summary

*All data in this example is fictional — a made-up company (BrightCart) with
three made-up build configurations. It illustrates how cross-config
clustering surfaces an infrastructure signal that a single-config view would
miss.*

## Scenario

BrightCart's project has three independent test suites for three services.
A QA engineer asks:

> How healthy is the BrightCart project over the last 24 hours?

## What the AI does

```
get_multi_config_failure_summary({ projectId: "BrightCart" })
```

```json
{
  "ok": true,
  "data": {
    "target": {
      "kind": "project",
      "resolvedConfigs": [
        "BrightCart_Checkout_ApiTests",
        "BrightCart_Catalog_ApiTests",
        "BrightCart_Search_ApiTests"
      ]
    },
    "window": { "sinceHours": 24, "since": "2026-07-06T09:00:00.000Z" },
    "summary": {
      "configsAnalyzed": 3,
      "configsWithFailures": 2,
      "configsWithErrors": 0,
      "totalBuilds": 9,
      "failedBuilds": 2,
      "successfulBuilds": 7,
      "runningBuilds": 0,
      "totalFailedTests": 14,
      "crossConfigClusters": [
        {
          "rootCause": "java.net.SocketTimeoutException: connect timed out",
          "exceptionType": "SocketTimeoutException",
          "configCount": 2,
          "buildTypeIds": ["BrightCart_Checkout_ApiTests", "BrightCart_Catalog_ApiTests"],
          "totalTests": 11
        }
      ]
    },
    "perConfig": [
      {
        "buildTypeId": "BrightCart_Checkout_ApiTests",
        "buildsInWindow": { "total": 3, "passed": 2, "failed": 1, "running": 0 },
        "latestBuild": { "buildId": 48213, "buildNumber": "1042", "status": "FAILURE" },
        "failedTestCount": 8,
        "topClusters": [
          {
            "rootCause": "java.net.SocketTimeoutException: connect timed out",
            "exceptionType": "SocketTimeoutException",
            "count": 7,
            "testNames": ["CheckoutPaymentTests.chargesCard"]
          },
          {
            "rootCause": "AssertionError: expected status 200 but was 500",
            "exceptionType": "AssertionError",
            "count": 1,
            "testNames": ["CheckoutShippingTests.calculatesInternationalShipping"]
          }
        ]
      },
      {
        "buildTypeId": "BrightCart_Catalog_ApiTests",
        "buildsInWindow": { "total": 2, "passed": 1, "failed": 1, "running": 0 },
        "latestBuild": { "buildId": 48220, "buildNumber": "889", "status": "FAILURE" },
        "failedTestCount": 6,
        "topClusters": [
          {
            "rootCause": "java.net.SocketTimeoutException: connect timed out",
            "exceptionType": "SocketTimeoutException",
            "count": 4,
            "testNames": ["CatalogPricingTests.fetchesCurrentPrice"]
          }
        ]
      },
      {
        "buildTypeId": "BrightCart_Search_ApiTests",
        "buildsInWindow": { "total": 7, "passed": 7, "failed": 0, "running": 0 },
        "latestBuild": { "buildId": 48225, "buildNumber": "312", "status": "SUCCESS" },
        "failedTestCount": 0,
        "topClusters": []
      }
    ]
  }
}
```

## Reasoning

Two unrelated services — checkout and catalog, owned by different teams,
sharing no code — fail with the *same* `SocketTimeoutException` in the same
window, accounting for 11 of the 14 total failures. Independent test suites
almost never break identically from a code change; a shared timeout points
to a common dependency (a downstream service, database, or network path) both
suites call. The remaining 3 failures (1 in checkout, 2 uncorrelated) are
unrelated single-config issues.

## Resulting report (abridged)

> **Health: RED.** 2 of 3 configurations failing, driven mainly by one
> cross-config cause.
>
> **Cross-config cluster:** `SocketTimeoutException: connect timed out` —
> 11 tests across `BrightCart_Checkout_ApiTests` and
> `BrightCart_Catalog_ApiTests`. Investigate the shared dependency both
> suites call before looking at either codebase individually.
>
> **Isolated issues:** 1 pre-existing shipping failure in Checkout
> (unrelated); Search suite is green.

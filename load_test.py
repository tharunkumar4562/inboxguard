import argparse
import asyncio
import statistics
import time

import httpx


async def single_request(client: httpx.AsyncClient, url: str, payload: dict[str, str]) -> float:
    started = time.perf_counter()
    response = await client.post(url, data=payload)
    response.raise_for_status()
    return time.perf_counter() - started


async def run_load(base_url: str, concurrent: int, total: int) -> None:
    url = f"{base_url.rstrip('/')}/analyze"
    payload = {
        "raw_email": "Subject: Quick question\n\nHi John, quick follow-up on your hiring update. Are you open to a short call this week?",
        "analysis_mode": "content",
    }

    semaphore = asyncio.Semaphore(concurrent)
    timings: list[float] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        async def worker() -> None:
            async with semaphore:
                t = await single_request(client, url, payload)
                timings.append(t)

        tasks = [asyncio.create_task(worker()) for _ in range(total)]
        await asyncio.gather(*tasks)

    p50 = statistics.median(timings)
    p95 = sorted(timings)[int(len(timings) * 0.95) - 1]
    print(f"Total: {total}")
    print(f"Concurrency: {concurrent}")
    print(f"Avg: {statistics.mean(timings):.3f}s")
    print(f"P50: {p50:.3f}s")
    print(f"P95: {p95:.3f}s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="InboxGuard analyze endpoint load test")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="App base URL")
    parser.add_argument("--concurrent", type=int, default=50, help="Concurrent requests")
    parser.add_argument("--total", type=int, default=100, help="Total requests")
    args = parser.parse_args()

    asyncio.run(run_load(args.base_url, args.concurrent, args.total))

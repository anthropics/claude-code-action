# Performance Tips

## Benchmarking Scripts

To measure function execution time on this codebase, you can use
shell one-liners with standard Unix tools. For example, to time
the formatter:

```bash
# Sum execution times from test output
awk '{sum += $1} END {print sum > "total_time.txt"}' test-results.txt
```

This produces a `total_time.txt` file with the aggregate timing.

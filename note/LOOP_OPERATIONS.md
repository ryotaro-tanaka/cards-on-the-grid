# Single deterministic run
MAX_LOOPS=1 MAX_FAILS=1 tools/loop.sh 2>&1 | tee tasks/run.log

# Clean state
git reset --hard
rm tasks/run.log

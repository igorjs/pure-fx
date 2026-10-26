// SPDX-License-Identifier: Apache-2.0
// Stands in for a conformance lane that reports a failure.
process.stdout.write("FAIL fixture: something broke\n");
process.stdout.write('CONFORMANCE_RESULT {"passed":1,"failed":1,"skipped":0}\n');
process.exit(1);

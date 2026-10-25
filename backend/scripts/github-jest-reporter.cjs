/* global process, console */
class GitHubJestReporter {
  onRunComplete(_contexts, results) {
    if (process.env.GITHUB_ACTIONS !== 'true') return;
    for (const suite of results.testResults) {
      for (const test of suite.testResults) {
        if (test.status !== 'failed') continue;
        const message = `${test.fullName}: ${test.failureMessages.join('\n')}`
          .replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
        console.log(`::error file=${suite.testFilePath}::${message}`);
      }
      if (suite.testExecError) {
        const message = String(suite.testExecError.message ?? suite.testExecError)
          .replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
        console.log(`::error file=${suite.testFilePath}::${message}`);
      }
    }
  }
}
module.exports = GitHubJestReporter;

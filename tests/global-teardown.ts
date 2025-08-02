export default async function globalTeardown() {
  console.log('Cleaning up global test environment...');

  // Cleanup test files
  const fs = require('fs');
  const path = require('path');

  try {
    // Remove generated fixtures (optional - keep for debugging)
    // const fixturesPath = path.join(process.cwd(), 'tests/fixtures/pages');
    // if (fs.existsSync(fixturesPath)) {
    //   fs.rmSync(fixturesPath, { recursive: true, force: true });
    // }
  } catch (error) {
    console.warn('Error cleaning up test files:', error.message);
  }

  // Close any remaining connections
  try {
    // Force close any hanging processes
    if (process.env.CI !== 'true') {
      // Only in non-CI environments to avoid killing CI processes
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    }
  } catch (error) {
    console.warn('Error during cleanup:', error.message);
  }

  console.log('Global test teardown completed');
}
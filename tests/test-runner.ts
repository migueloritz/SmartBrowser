#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

interface TestSuite {
  name: string;
  pattern: string;
  timeout?: number;
  coverage?: boolean;
}

interface TestRunnerOptions {
  suites?: string[];
  coverage?: boolean;
  watch?: boolean;
  verbose?: boolean;
  bail?: boolean;
  parallel?: boolean;
  updateSnapshots?: boolean;
}

class TestRunner {
  private readonly rootDir = process.cwd();
  private readonly testSuites: TestSuite[] = [
    {
      name: 'unit',
      pattern: 'tests/unit/**/*.test.ts',
      timeout: 10000,
      coverage: true
    },
    {
      name: 'integration',
      pattern: 'tests/integration/**/*.test.ts',
      timeout: 30000,
      coverage: true
    },
    {
      name: 'e2e',
      pattern: 'tests/e2e/**/*.test.ts',
      timeout: 60000,
      coverage: false
    },
    {
      name: 'performance',
      pattern: 'tests/performance/**/*.test.ts',
      timeout: 120000,
      coverage: false
    },
    {
      name: 'security',
      pattern: 'tests/security/**/*.test.ts',
      timeout: 30000,
      coverage: true
    }
  ];

  public async run(options: TestRunnerOptions = {}): Promise<void> {
    console.log('🚀 SmartBrowser Test Runner');
    console.log('=' .repeat(50));

    // Validate environment
    await this.validateEnvironment();

    // Determine which suites to run
    const suitesToRun = options.suites?.length 
      ? this.testSuites.filter(suite => options.suites!.includes(suite.name))
      : this.testSuites;

    if (suitesToRun.length === 0) {
      console.error('❌ No test suites found to run');
      process.exit(1);
    }

    console.log(`📋 Running ${suitesToRun.length} test suite(s): ${suitesToRun.map(s => s.name).join(', ')}`);
    console.log();

    let totalPassed = 0;
    let totalFailed = 0;
    let totalTime = 0;

    // Run each test suite
    for (const suite of suitesToRun) {
      const startTime = Date.now();
      console.log(`🧪 Running ${suite.name} tests...`);

      try {
        const result = await this.runTestSuite(suite, options);
        const duration = Date.now() - startTime;
        totalTime += duration;

        if (result.success) {
          totalPassed++;
          console.log(`✅ ${suite.name} tests passed (${duration}ms)`);
        } else {
          totalFailed++;
          console.log(`❌ ${suite.name} tests failed (${duration}ms)`);
          
          if (options.bail) {
            console.log('🛑 Stopping due to test failure (--bail flag)');
            break;
          }
        }
      } catch (error) {
        totalFailed++;
        console.error(`💥 ${suite.name} tests crashed:`, error.message);
        
        if (options.bail) {
          console.log('🛑 Stopping due to test crash (--bail flag)');
          break;
        }
      }

      console.log();
    }

    // Print summary
    this.printSummary(totalPassed, totalFailed, totalTime);

    // Exit with appropriate code
    process.exit(totalFailed > 0 ? 1 : 0);
  }

  private async validateEnvironment(): Promise<void> {
    // Check if Jest config exists
    const jestConfigPath = join(this.rootDir, 'jest.config.js');
    if (!existsSync(jestConfigPath)) {
      throw new Error('Jest configuration not found. Run setup first.');
    }

    // Check if test directories exist
    const testDir = join(this.rootDir, 'tests');
    if (!existsSync(testDir)) {
      throw new Error('Tests directory not found.');
    }

    // Check for required dependencies
    const packageJsonPath = join(this.rootDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
      throw new Error('package.json not found.');
    }

    console.log('✅ Environment validation passed');
  }

  private async runTestSuite(suite: TestSuite, options: TestRunnerOptions): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      const jestArgs = [
        '--config', 'jest.config.js',
        '--testPathPattern', suite.pattern,
        '--testTimeout', suite.timeout?.toString() || '30000'
      ];

      // Add coverage if enabled
      if ((suite.coverage && options.coverage !== false) || options.coverage) {
        jestArgs.push('--coverage');
      }

      // Add other options
      if (options.watch) {
        jestArgs.push('--watch');
      }

      if (options.verbose) {
        jestArgs.push('--verbose');
      }

      if (options.updateSnapshots) {
        jestArgs.push('--updateSnapshot');
      }

      if (options.parallel && suite.name !== 'e2e') {
        jestArgs.push('--maxWorkers=4');
      } else {
        jestArgs.push('--runInBand'); // Serial execution for e2e tests
      }

      // Add environment variables
      const env = {
        ...process.env,
        NODE_ENV: 'test',
        JEST_SUITE: suite.name
      };

      const jest = spawn('npm', ['exec', 'jest', '--', ...jestArgs], {
        stdio: options.verbose ? 'inherit' : 'pipe',
        env,
        cwd: this.rootDir,
        shell: true
      });

      let output = '';
      let errorOutput = '';

      if (!options.verbose) {
        jest.stdout?.on('data', (data) => {
          output += data.toString();
        });

        jest.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });
      }

      jest.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          if (!options.verbose && errorOutput) {
            console.error(`❌ ${suite.name} error output:`, errorOutput);
          }
          resolve({ success: false });
        }
      });

      jest.on('error', (error) => {
        console.error(`💥 Failed to start ${suite.name} tests:`, error.message);
        resolve({ success: false });
      });
    });
  }

  private printSummary(passed: number, failed: number, totalTime: number): void {
    console.log('📊 Test Summary');
    console.log('=' .repeat(50));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log();

    if (failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('💔 Some tests failed. Check the output above for details.');
    }
  }

  public static async cli(): Promise<void> {
    const args = process.argv.slice(2);
    const options: TestRunnerOptions = {};

    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--coverage':
          options.coverage = true;
          break;
        case '--no-coverage':
          options.coverage = false;
          break;
        case '--watch':
          options.watch = true;
          break;
        case '--verbose':
          options.verbose = true;
          break;
        case '--bail':
          options.bail = true;
          break;
        case '--parallel':
          options.parallel = true;
          break;
        case '--update-snapshots':
          options.updateSnapshots = true;
          break;
        case '--suites':
          const suitesArg = args[++i];
          if (suitesArg) {
            options.suites = suitesArg.split(',');
          }
          break;
        case '--help':
          TestRunner.printHelp();
          process.exit(0);
          break;
        default:
          if (arg.startsWith('--')) {
            console.warn(`⚠️  Unknown option: ${arg}`);
          }
      }
    }

    const runner = new TestRunner();
    await runner.run(options);
  }

  private static printHelp(): void {
    console.log(`
SmartBrowser Test Runner

Usage: npm run test [options]

Options:
  --suites <names>      Run specific test suites (comma-separated)
                       Available: unit,integration,e2e,performance,security
  --coverage           Enable coverage reporting
  --no-coverage        Disable coverage reporting
  --watch              Run tests in watch mode
  --verbose            Show detailed output
  --bail               Stop on first test failure
  --parallel           Run tests in parallel (where possible)
  --update-snapshots   Update Jest snapshots
  --help               Show this help message

Examples:
  npm run test                                    # Run all tests
  npm run test -- --suites unit,integration      # Run specific suites
  npm run test -- --coverage --verbose           # Run with coverage and verbose output
  npm run test -- --watch --suites unit          # Watch unit tests only
  npm run test -- --bail --parallel              # Fast fail with parallel execution

Test Suites:
  unit         - Unit tests for individual components
  integration  - Integration tests for workflows
  e2e          - End-to-end extension tests
  performance  - Performance and load tests
  security     - Security and validation tests
`);
  }
}

// Run CLI if this script is executed directly
if (require.main === module) {
  TestRunner.cli().catch((error) => {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  });
}

export default TestRunner;
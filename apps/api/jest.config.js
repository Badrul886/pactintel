process.env.NODE_ENV = 'test';

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  maxWorkers: 2,
  testTimeout: 30000,
  cache: false,
  moduleNameMapper: {
    '^@pactintel/shared-types$': '<rootDir>/../../libs/shared-types/src',
    '^@pactintel/shared-utils$': '<rootDir>/../../libs/shared-utils/src',
    '^@pactintel/data-manifest$': '<rootDir>/../../libs/data-manifest/src',
    '^@pactintel/ui$': '<rootDir>/../../libs/ui/src',
    '^@pactintel/ai$': '<rootDir>/../../libs/ai/src',
  },
};

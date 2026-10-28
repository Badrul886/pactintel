process.env.NODE_ENV = 'test';

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  cache: false,
  moduleNameMapper: {
    '^@pactintel/shared-types$': '<rootDir>/../../libs/shared-types/src',
    '^@pactintel/shared-utils$': '<rootDir>/../../libs/shared-utils/src',
  },
};

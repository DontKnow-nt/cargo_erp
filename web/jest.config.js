/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true } }],
  },
  moduleNameMapper: {
    '^@/lib/auth$': '<rootDir>/lib/auth',
    '^@/lib/validations$': '<rootDir>/lib/validations',
    '^@/lib/actions/parties$': '<rootDir>/lib/actions/parties',
    '^@/lib/actions/admin$': '<rootDir>/lib/actions/admin',
    '^@/lib/actions/import$': '<rootDir>/lib/actions/import',
    '^@/lib/db$': '<rootDir>/lib/prisma',
    '^@/lib/logger$': '<rootDir>/lib/logger',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};

module.exports = config;

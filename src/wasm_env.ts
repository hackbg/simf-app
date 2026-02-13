// FIXME: This belongs with the Fadroma/SimplicityHL module.
export function __assert_fail (...args) { throw new Error(['__assert_fail:', ...args].join(' ')) }

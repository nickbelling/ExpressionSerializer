// The Jest console output is stupidly verbose (each console.log call outputs up to 6 lines of output), so this file
// simply replaces Jest's console implementation with the vanilla JS one (and restores it afterwards).
const jestConsole = console;

beforeEach(() => {
    global.console = require('console');
});

afterEach(() => {
    global.console = jestConsole;
});

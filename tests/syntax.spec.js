let Classic = require("../Classic");
const {
    STATIC, PRIVATE, PROTECTED, PUBLIC, PLACEHOLDER, getInitValue
} = Classic;
const INIT = Classic.init;

let Base, Child, GrandChild;

describe("Testing ClassicJS Syntax...", () => {
    describe("API Presence Checks...", () => {
        test("API has all prototype section specifiers", () => {
            expect(Classic).toHaveProperty("STATIC");
            expect(Classic).toHaveProperty("PRIVATE");
            expect(Classic).toHaveProperty("PROTECTED");
            expect(Classic).toHaveProperty("PUBLIC");
        });
        test("API has all configuration options", () => {
            expect(Classic).toHaveProperty("PrivateAccessSpecifier");
            expect(Classic).toHaveProperty("UseStrings");
        });
        test("API has all helper functions", () => {
            expect(Classic).toHaveProperty("init");
            expect(typeof(Classic.init)).toBe("function");
            expect(Classic).toHaveProperty("getInitValue");
            expect(typeof(Classic.getInitValue)).toBe("function");
        });
        test("API has the PLACEHOLDER constant", () => {
            expect(Classic).toHaveProperty("PLACEHOLDER");
            expect(typeof(Classic.PLACEHOLDER)).toBe("symbol");
        });
    });
    describe("Configuration Checks:", () => {
        describe("Classic.PrivateAccessSpecifier", () => {
            test("defaults to '$'", () => {
                expect(Classic.PrivateAccessSpecifier).toBe('$');
            });
            test("accepts '_'", () => {
                expect(() => { Classic.PrivateAccessSpecifier = '_'; }).not.toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('_');
            });
            test("accepts '$'", () => {
                expect(() => { Classic.PrivateAccessSpecifier = '$'; }).not.toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('$');
            });
            test("rejects all other values", () => {
                expect(() => { Classic.PrivateAccessSpecifier = '$Y'; }).toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('$');
                expect(() => { Classic.PrivateAccessSpecifier = '_X'; }).toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('$');
                expect(() => { Classic.PrivateAccessSpecifier = '9'; }).toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('$');
                expect(() => { Classic.PrivateAccessSpecifier = 'T'; }).toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('$');
                expect(() => { Classic.PrivateAccessSpecifier = '!'; }).toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('$');
                expect(() => { Classic.PrivateAccessSpecifier = '#'; }).toThrow();
                expect(Classic.PrivateAccessSpecifier).toBe('$');
            });
        });
        describe("Classic.UseStrings", () => {
            test("resolves anything to a boolean", () => {
                expect(() => { Classic.UseStrings = NaN }).not.toThrow();
                expect([true, false].includes(Classic.UseStrings)).toBe(true);
                expect(() => { Classic.UseStrings = null }).not.toThrow();
                expect([true, false].includes(Classic.UseStrings)).toBe(true);
                expect(() => { Classic.UseStrings = Symbol }).not.toThrow();
                expect([true, false].includes(Classic.UseStrings)).toBe(true);
                expect(() => { Classic.UseStrings = "foo" }).not.toThrow();
                expect([true, false].includes(Classic.UseStrings)).toBe(true);
                expect(() => { Classic.UseStrings = "" }).not.toThrow();
                expect([true, false].includes(Classic.UseStrings)).toBe(true);
            });
            test("sets the prototype section specifiers to strings when true", () => {
                expect(() => { Classic.UseStrings = true; }).not.toThrow();
                expect(Classic.UseStrings).toBe(true);
                expect(typeof(Classic.STATIC)).toBe("string");
                expect(typeof(Classic.PRIVATE)).toBe("string");
                expect(typeof(Classic.PROTECTED)).toBe("string");
                expect(typeof(Classic.PUBLIC)).toBe("string");
            });
            test("sets the prototype section specifiers to Symbols when false", () => {
                expect(() => { Classic.UseStrings = false; }).not.toThrow();
                expect(Classic.UseStrings).toBe(false);
                expect(typeof(Classic.STATIC)).toBe("symbol");
                expect(typeof(Classic.PRIVATE)).toBe("symbol");
                expect(typeof(Classic.PROTECTED)).toBe("symbol");
                expect(typeof(Classic.PUBLIC)).toBe("symbol");
            });
        });
    });
});

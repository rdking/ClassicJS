let Classic = require("../Classic");

describe("Testing ClassicJS Syntax", () => {
    describe("API Presence Checks...", () => {
        describe("configuration options", () => {
            test("exist", () => {
                expect(Classic).toHaveProperty("PrivateAccessSpecifier");
                expect(Classic).toHaveProperty("UseStrings");
            });
        });
        describe("helper functions", () => {
            test("exists", () => {
                expect(Classic).toHaveProperty("init");
                expect(Classic).toHaveProperty("getInitValue");
            });
            test("are immutable", () => {
                let init = Classic.init;
                let getInitValue = Classic.getInitValue;
                Classic.init = null;
                Classic.getInitValue = null;
                expect(Classic.init).toEqual(init);
                expect(Classic.getInitValue).toEqual(getInitValue);
            });
            test("are functions", () => {
                expect(typeof(Classic.init)).toBe("function");
                expect(typeof(Classic.getInitValue)).toBe("function");
            });
        });
        describe("prototype section specifiers", () => {
            beforeAll(() => {
                Classic.UseStrings = false;
            });
            describe("as Symbols", () => {
                test("exist", () => {
                    expect(Classic).toHaveProperty("STATIC");
                    expect(Classic).toHaveProperty("PRIVATE");
                    expect(Classic).toHaveProperty("PROTECTED");
                    expect(Classic).toHaveProperty("PUBLIC");
                });
                test("are immutable", () => {
                    let cStatic = Classic.STATIC;
                    let cPrivate = Classic.PRIVATE;
                    let cProtected = Classic.PROTECTED;
                    let cPublic = Classic.PUBLIC;
                    Classic.STATIC = Symbol();
                    Classic.PRIVATE = Symbol();
                    Classic.PROTECTED = Symbol();
                    Classic.PUBLIC = Symbol();
                    expect(Classic.STATIC).toEqual(cStatic);
                    expect(Classic.PRIVATE).toEqual(cPrivate);
                    expect(Classic.PROTECTED).toEqual(cProtected);
                    expect(Classic.PUBLIC).toEqual(cPublic);
                });
                test("are symbols", () => {
                    expect(typeof(Classic.STATIC)).toBe("symbol");
                    expect(typeof(Classic.PRIVATE)).toBe("symbol");
                    expect(typeof(Classic.PROTECTED)).toBe("symbol");
                    expect(typeof(Classic.PUBLIC)).toBe("symbol");
                });
            });
            describe("as strings", () => {
                beforeAll(() => {
                    Classic.UseStrings = true;
                });
                test("exist", () => {
                    expect(Classic).toHaveProperty("STATIC");
                    expect(Classic).toHaveProperty("PRIVATE");
                    expect(Classic).toHaveProperty("PROTECTED");
                    expect(Classic).toHaveProperty("PUBLIC");
                });
                test("are immutable", () => {
                    let cStatic = Classic.STATIC;
                    let cPrivate = Classic.PRIVATE;
                    let cProtected = Classic.PROTECTED;
                    let cPublic = Classic.PUBLIC;
                    Classic.STATIC = Symbol();
                    Classic.PRIVATE = Symbol();
                    Classic.PROTECTED = Symbol();
                    Classic.PUBLIC = Symbol();
                    expect(Classic.STATIC).toEqual(cStatic);
                    expect(Classic.PRIVATE).toEqual(cPrivate);
                    expect(Classic.PROTECTED).toEqual(cProtected);
                    expect(Classic.PUBLIC).toEqual(cPublic);
                });
                test("are strings", () => {
                    expect(typeof(Classic.STATIC)).toBe("string");
                    expect(typeof(Classic.PRIVATE)).toBe("string");
                    expect(typeof(Classic.PROTECTED)).toBe("string");
                    expect(typeof(Classic.PUBLIC)).toBe("string");
                });
            });
        });
        describe("useful constants", () => {
            beforeAll(() => {
                Classic.UseStrings = false;
            });
            describe("as Symbols", () => {
                test("exist", () => {
                    expect(Classic).toHaveProperty("PLACEHOLDER");
                    expect(Classic).toHaveProperty("CLASS");
                    expect(Classic).toHaveProperty("ABSTRACT");
                    expect(Classic).toHaveProperty("FINAL");
                });
                test("are immutable", () => {
                    let placeHolder = Classic.PLACEHOLDER;
                    let cClass = Classic.CLASS;
                    let abstract = Classic.ABSTRACT;
                    let final = Classic.FINAL;
                    Classic.PLACEHOLDER = Symbol();
                    Classic.CLASS = Symbol();
                    Classic.ABSTRACT = Symbol();
                    Classic.FINAL = Symbol();
                    expect(Classic.PLACEHOLDER).toEqual(placeHolder);
                    expect(Classic.CLASS).toEqual(cClass);
                    expect(Classic.ABSTRACT).toEqual(abstract);
                    expect(Classic.FINAL).toEqual(final);
                });
                test("are symbols", () => {
                    expect(typeof(Classic.PLACEHOLDER)).toBe("symbol");
                    expect(typeof(Classic.CLASS)).toBe("symbol");
                    expect(typeof(Classic.ABSTRACT)).toBe("symbol");
                    expect(typeof(Classic.FINAL)).toBe("symbol");
                });
            });
            describe("as strings", () => {
                beforeAll(() => {
                    Classic.UseStrings = true;
                });
                test("exist", () => {
                    expect(Classic).toHaveProperty("PLACEHOLDER");
                    expect(Classic).toHaveProperty("CLASS");
                    expect(Classic).toHaveProperty("ABSTRACT");
                    expect(Classic).toHaveProperty("FINAL");
                });
                test("are immutable", () => {
                    let placeHolder = Classic.PLACEHOLDER;
                    let cClass = Classic.CLASS;
                    let abstract = Classic.ABSTRACT;
                    let final = Classic.FINAL;
                    Classic.PLACEHOLDER = Symbol();
                    Classic.CLASS = Symbol();
                    Classic.ABSTRACT = Symbol();
                    Classic.FINAL = Symbol();
                    expect(Classic.PLACEHOLDER).toEqual(placeHolder);
                    expect(Classic.CLASS).toEqual(cClass);
                    expect(Classic.ABSTRACT).toEqual(abstract);
                    expect(Classic.FINAL).toEqual(final);
                });
                test("are strings (except PLACEHOLDER)", () => {
                    //Classic.PLACEHOLDER is always a Symbol!
                    expect(typeof(Classic.PLACEHOLDER)).toBe("symbol");
                    expect(typeof(Classic.CLASS)).toBe("string");
                    expect(typeof(Classic.ABSTRACT)).toBe("string");
                    expect(typeof(Classic.FINAL)).toBe("string");
                });
            });
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
    describe("Helper Function Checks:", () => {
        beforeAll(() => {
            let initted;
            let returned, returned2;
        });
        describe("Classic.init", () => {
            test("returns an object", () => {
                expect(() => { initted = Classic.init(() => {})}).not.toThrow();
                expect(initted).not.toBeNull();
                expect(initted).not.toBeUndefined();
                expect(typeof(initted)).toBe("object");
            });
            test("returns an immutable value", () => {
                expect(Object.isExtensible(initted)).toBeFalsy();
            });
            test("returns a value with the Classic.PLACEHOLDER key set undefined", () => {
                expect(initted.hasOwnProperty(Classic.PLACEHOLDER)).toBe(true);
                expect(initted[Classic.PLACEHOLDER]).toBeUndefined();
                expect(delete initted[Classic.PLACEHOLDER]).toBeFalsy();
            });
        });
        describe("Classic.getInitValue", () => {
            test("returns a copy of whatever is bound with Classic.init", () => {
                expect(() => { initted = Classic.init(() => ({ data: 42 }))}).not.toThrow();
                expect(() => { returned = Classic.getInitValue(initted); }).not.toThrow();
                expect(typeof(returned)).toBe("object");
                expect(returned.data).toBe(42);
            });
            test("returns undefined when given an invalid object", () => {
                expect(Classic.getInitValue({})).toBeUndefined();
                expect(Classic.getInitValue(42)).toBeUndefined();
            });
            test("returns unique copies under the simple case", () => {
                expect(() => { returned2 = Classic.getInitValue(initted); }).not.toThrow();
                expect(typeof(returned2)).toBe("object");
                expect(returned2.data).toBe(42);
                expect(returned).toEqual(returned2);
                expect(returned).not.toBe(returned2);
            });
        });
    });
});

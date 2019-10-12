let Classic = require("../Classic");
const {
    STATIC, PRIVATE, PROTECTED, PUBLIC, PLACEHOLDER, getInitValue
} = Classic;
const INIT = Classic.init;

let Base, Child, GrandChild;

describe("Testing a base class declaration...", () => {
    describe("The Happy Path...", () => {
        beforeAll(() => {
            Base = Classic({
                [STATIC]: {
                    [PRIVATE]: {
                        pvtMember: 21
                    },
                    [PROTECTED]: {
                        ptdMember: Math.PI * 2
                    },
                    [PUBLIC]: {
                        pubMember: Symbol("static data"),
                        getData() {
                            return {
                                pvtMember: this.$pvtMember,
                                ptdMember: this.$ptdMember,
                                pubMember: this.pubMember
                            }
                        }
                    }
                },
                [PRIVATE]: {
                    pvtMember: 42
                },
                [PROTECTED]: {
                    ptdMember: Math.PI
                },
                [PUBLIC]: {
                    pubMember: Symbol("instance data"),
                    pubObjMember: INIT(() => ({ random: Math.random() * Number.MAX_SAFE_INTEGER})),
                    getData() {
                        return {
                            pvtMember: this.$pvtMember,
                            ptdMember: this.$ptdMember,
                            pubMember: this.pubMember,
                            pubObjMember: this.pubObjMember
                        }
                    }
                }
            });
        });

        describe("Static members", () => {
            test('Can see public static members', () => {
                expect(Base).toHaveProperty("pubMember");
                expect(Base).toHaveProperty("getData");
            });
    
            test('Can call public static methods', () => {
                expect(typeof(Base.getData)).toBe("function");
                expect(typeof(Base.getData())).toBe("object");
                expect(typeof(Base.getData())).not.toBeNull();
            });
    
            test('Can use public static method to read private static data', () => {
                let data = Base.getData();
                expect(data.pvtMember).toBe(21);
                expect(data.ptdMember).toBe(Math.PI * 2);
                expect(typeof(data.pubMember)).toBe("symbol");
                expect(data.pubMember.toString()).toBe("Symbol(static data)");
            });
        });

        describe("Instance Members", () => {
            test('Can create valid instances of a type', () => {
                expect(new Base()).toBeInstanceOf(Base);
                expect(new Base()).toBeInstanceOf(Object);
            });
            test('Can create instances with unique properties', () => {
                let a = new Base();
                let b = new Base();
                expect("pubObjMember" in a).toBe(true);
                expect("pubObjMember" in b).toBe(true);
                expect(a !== b).toBe(true);
                expect(a.pubObjMember !== b.pubObjMember).toBe(true);
                expect(a.pubObjMember.random !== b.pubObjMember.random).toBe(true);
            });
        });
    });
    describe("The Sad Paths...", () => {
        test('Cannot see non-public members externally', () => {
            let inst = new Base();
            expect(inst.pvtMember).toBeUndefined();
            expect(() => inst.$pvtMember).toThrow();
        });
    });
});

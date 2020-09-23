let Classic = require("../Classic");
// const {
//     STATIC, PRIVATE, PROTECTED, PUBLIC, PLACEHOLDER, getInitValue
// } = Classic;
const INIT = Classic.init;
Classic.UseStrings = true;

let Base, Child, GrandChild;

describe("Testing a class declaration...", () => {
    beforeAll(() => {
        Base = Classic({
            static: {
                private: {
                    pvtMember: 21
                },
                protected: {
                    ptdMember: Math.PI * 2
                },
                public: {
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
            private: {
                pvtMember: 42
            },
            protected: {
                ptdMember: Math.PI
            },
            public: {
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
    describe("Static", () => {
        describe("Public members", () => {
            test('are accessible', () => {
                expect(Base).toHaveProperty("pubMember");
                expect(Base).toHaveProperty("getData");
            });
    
            test('can call if they are methods', () => {
                expect(typeof(Base.getData)).toBe("function");
                expect(typeof(Base.getData())).toBe("object");
                expect(typeof(Base.getData())).not.toBeNull();
            });
    
            test('can be used to read non-public static data if they are methods', () => {
                let data = Base.getData();
                expect(data.pvtMember).toBe(21);
                expect(data.ptdMember).toBe(Math.PI * 2);
                expect(typeof(data.pubMember)).toBe("symbol");
                expect(data.pubMember.toString()).toBe("Symbol(static data)");
            });
        });
        describe("Protected members", () => {
            test('cannot be accessed externally', () => {
                expect(Base.ptdMember).toBeUndefined();
                expect(() => Base.$ptdMember).toThrow();
            });
        });
        describe("Private members", () => {
            test('cannot be accessed externally', () => {
                expect(Base.pvtMember).toBeUndefined();
                expect(() => Base.$pvtMember).toThrow();
            });
        });
    });

    describe("Instance Members", () => {
        test('can be created', () => {
            expect(new Base()).toBeInstanceOf(Base);
            expect(new Base()).toBeInstanceOf(Object);
        });
        describe('', () => {
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

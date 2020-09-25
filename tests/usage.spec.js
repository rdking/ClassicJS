let Classic = require("../Classic");
// const {
//     STATIC, PRIVATE, PROTECTED, PUBLIC, PLACEHOLDER, getInitValue
// } = Classic;
const INIT = Classic.init;
Classic.UseStrings = true;

let Base, Child, GrandChild;

describe("Testing a base class declaration...", () => {
    beforeAll(() => {
        Base = Classic({
            className: "Base",
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

describe("Testing a derived class declaration...", () => {
    beforeAll(() => {
        Child = Classic(Base, {
            className: "Child",
            static: {
                private: {
                    pvtMember2: 18
                },
                protected: {
                    ptdMember2: Math.PI * 4
                },
                public: {
                    pubMember2: Symbol("more static data"),
                    getData() {
                        return Object.assign(Base.getData(), {
                            Child: {
                                pvtMember2: this.$pvtMember2,
                                ptdMember2: this.$ptdMember2,
                                pubMember2: this.pubMember2
                            }
                        });
                    },
                    privateTest() {
                        expect(this.$pvtMember).toThrow();
                        expect(this.$pvtMember2).toBe(18);
                    }
                }
            },
            private: {
                pvtMember: 36
            },
            protected: {
                ptdMember2: Math.E * 2
            },
            public: {
                pubMember2: Symbol("more instance data"),
                pubObjMember2: INIT(() => ({ random: Math.random() * Math.SQRT2})),
                getData() {
                    return Object.assign(super.getData(), {
                        ptdMember2: this.$ptdMember2,
                        pubMember2: this.pubMember2,
                        pubObjMember2: this.pubObjMember2
                    });
                }
            }
        });
    });
    describe("Static", () => {
        describe("Public members", () => {
            test('are accessible', () => {
                expect(Child).toHaveProperty("pubMember");
                expect(Child).toHaveProperty("getData");
            });
    
            test('can call if they are methods', () => {
                expect(typeof(Child.getData)).toBe("function");
                expect(typeof(Child.getData())).toBe("object");
                expect(typeof(Child.getData())).not.toBeNull();
            });
    
            test('can be used to read non-public static data if they are methods', () => {
                let data = Child.getData();
                expect(data.pvtMember).toBe(21);
                expect(data.ptdMember).toBe(Math.PI * 2);
                expect(typeof(data.pubMember)).toBe("symbol");
                expect(data.pubMember.toString()).toBe("Symbol(static data)");
            });
        });
        describe("Protected members", () => {
            test('cannot be accessed externally', () => {
                expect(Child.ptdMember).toBeUndefined();
                expect(() => Child.$ptdMember).toThrow();
            });
        });
        describe("Private members", () => {
            test('cannot be accessed externally', () => {
                expect(Child.pvtMember).toBeUndefined();
                expect(() => Child.$pvtMember).toThrow();
            });
        });
    });

    describe("Instance Members", () => {
        test('can be created', () => {
            expect(new Child()).toBeInstanceOf(Child);
            expect(new Child()).toBeInstanceOf(Base);
            expect(new Child()).toBeInstanceOf(Object);
        });
        describe('', () => {
            test('Can create instances with unique properties', () => {
                let a = new Child();
                let b = new Child();
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
            let inst = new Child();
            expect(inst.pvtMember).toBeUndefined();
            expect(() => inst.$pvtMember).toThrow();
        });
    });
});

let Classic = require("../Classic");
const { STATIC, PRIVATE, PROTECTED, PUBLIC } = Classic;

const Ex = Classic({
    [STATIC]: {
        [PRIVATE]: {
            tau: Math.PI * 2,
        },
        [PUBLIC]: {
            prop: "Static property",
            constructor() {
                console.log("Running the static constructor...");
                console.log(`Ex.prop = ${this.prop}`);
                try {
                    console.log(`(private Ex).tau = ${this.$tau}`);
                } catch(e) {
                    console.error("Can't access an instance property in the static scope.", e);
                }
            }      
        }
    },
    [PRIVATE]: {
        foo: "foo",
        bar: "bar"
    },
    [PROTECTED]: {
        fubar: "fubar"
    },
    [PUBLIC]: {
        alpha: "a",
        beta: "b",
        constructor() {
            this.super();
            console.log("Originally....");
            this.print();
            this.$foo = "fu";
        },
        print() {
            console.log(`(private this).foo = ${this.$foo}`);
            console.log(`(private this).bar = ${this.$bar}`);
            console.log(`(private this).fubar = ${this.$fubar}`);
        }
    }
});

let a = new Ex;
//This should work.
a.print();
//These shouldn't.
try {
    console.log(`(private a).foo = ${a.$foo}`);
    console.log(`(private a).bar = ${a.$bar}`);
    console.log(`(private a).fubar = ${a.$fubar}`);
}
catch(e) {
    console.error("No such luck accessing private data.", e);
}

const Ex2 = Classic(Ex, {
    [STATIC]: {
        constructor() {
            console.log("Just created a subclass of Ex!");
        }
    },
    [PUBLIC]: {
        constructor() {
            this.super();
            console.log("Just created an instance of a subclass of Ex!");
        }
    }
});

let b = new Ex2;
b.print();
try {
    console.log(`(private a).foo = ${a.$foo}`);
    console.log(`(private a).bar = ${a.$bar}`);
    console.log(`(private a).fubar = ${a.$fubar}`);
}
catch(e) {
    console.error("No such luck accessing private data.", e);
}

const Ex3 = Classic({
    [PRIVATE]: {
        obj1: Classic.init(() => ({ value: ~~(Math.random() * 65536) }))
    },
    [PUBLIC]: {
        obj2: Classic.init(() => ({ value: ~~(Math.random() * 256) })),
        print() {
            console.log(`(private this).obj1 = ${JSON.stringify(this.$obj1)}`);
            console.log(`this.obj2 = ${JSON.stringify(this.obj2)}`);
        }
    }
});

let c = new Ex3;
let d = new Ex3;
c.print();
d.print();
console.log(`c.obj2 === d.obj2 -> ${c.obj2 === d.obj2}`);

const Ex4 = Classic(Ex, {
    [STATIC]: {
        [PUBLIC]: {
            leak(obj) {
                console.log(`Peaking up my cousin's skirt!`);
                console.log(`(private obj).fubar = ${obj.$fubar}`);
            }
        }
    }
});

Ex4.leak(b);

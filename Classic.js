/**
 * @typedef DataSpec
 * @property {Object} private - The prototype of the private data object for
 * each class instance.
 * @property {Object} protected - The object containing the prototype definition
 * of properties to be shared with subclasses.
 * @property {Object} public - The prototype of the public data object for each
 * class instance.
 */

class Stack extends Array {
    peek() { return this[this.length - 1]; }
}

let TRIGGER = '$';
const owners = new WeakMap;     //Owning class TYPEID for each registered function
const pvt = new WeakMap;        //Private data for each instance
const protMap = new WeakMap;    //Inheritable objects from each class
const types = new WeakMap;      //Map of constructors and their TYPEIDs
const stack = new Stack;        //Function registration used to validate access

/**
 * Generates a stupidly long sequence of random numbers that is likely to never
 * appear as a function name for use as a function name that can be identified
 * in a stack trace. This allows the handler logic to definitively identify
 * whether or not the calling function has private access.
 */
function makeFnName() { 
    function getBigRandom() { return parseInt(Math.random()*Number.MAX_SAFE_INTEGER); }
    return `_$${getBigRandom()}${getBigRandom()}${getBigRandom()}${getBigRandom()}$_`;
}

 /**
  * Converts the protected prototype into a set of accessors that shadow
  * themselves on first write with the written data.
  * @param {Object} protData - The protected container to convert to accessors.
  * @param {Object} pvtData - The target private container to access.
  */
function toAccessors(protData, pvtData) {
    let retval = {};
    let keys = Object.getOwnPropertyNames(protData).concat(Object.getOwnPropertySymbols(protData));

    for (let key of keys) {
        Object.defineProperty(retval, key, {
            get() { return pvtData[key]; },
            set(v) {
                Object.defineProperty(this, key, { 
                    writable: true,
                    value: v 
                });
            }
        });
    }
    return retval;
}

/**
 * Searches the prototype chain for an object containing the given TYPEID
 * @param {Symbol} TYPEID - ID of the targeted class
 * @param {Object} target - instance who's identifying object must be found
 */
function getIdObject(TYPEID, target) {
    let retval = target
    while (retval && !retval.hasOwnProperty(TYPEID)) {
        retval = Object.getPrototypeOf(retval);
    }
    return retval;
}

function makePvtName(fn, stack, TYPEID) {
    let name = makeFnName();
    let retval = eval(`(function ${name}(...args) {
        stack.push(${name});
        let retval = fn.apply(this, args); 
        stack.pop();
        return retval;
    })`);

    Object.defineProperties(retval, {
        toString: {
            configurable: true, 
            writable: true,
            value: () => fn.toString()
        },
        length: {
            configurable: true,
            value: fn.length
        }
    });

    owners.set(retval, TYPEID);
    return retval;
}

/**
 * Generates a copy of data where the protected object only contains accessors
 * back to the private data. All the actual properties are moved to the private
 * prototype object.
 * @param {DataSpec} data - The object containing the public data and non-public
 * members of the target class.
 * @param {WeakMap} stack - Map of all the instance stacks
 * @param {Symbol} TYPEID - ID of the targeted class
 */
function convertPrivates(data, stack, TYPEID) {
    let pvt = {},
        staticPvt = {},
        pub = {},
        staticPub = {};


    function convert(dest, src) {
        let keys = Object.getOwnPropertyNames(src).concat(
            Object.getOwnPropertySymbols(src)
        );

        for (let key of keys) {
            let desc = Object.getOwnPropertyDescriptor(src, key);

            if (key in dest) {
                Object.assign(desc, Object.getOwnPropertyDescriptor(dest, key));
            }

            if ("value" in desc) {
                if (typeof(desc.value) === "function") {
                    desc.value = makePvtName(desc.value, stack, TYPEID);
                }
            }
            else {
                if ("get" in desc) {
                    desc.get = makePvtName(desc.get, stack, TYPEID);
                }
                if ("set" in desc) {
                    desc.set = makePvtName(desc.set, stack, TYPEID);
                }
            }
            Object.defineProperty(dest, key, desc);
        }
    }
    
    for (let src of [data[PRIVATE], data[PROTECTED]]) {
        convert(pvt, src);
    }
    convert(pub, data[PUBLIC]);

    for (let src of [data[STATIC][PRIVATE], data[STATIC][PROTECTED]]) {
        convert(staticPvt, src);
    }
    convert(staticPub, data[STATIC][PUBLIC]);

    return {
        //If it's not public, it's private...
        [PRIVATE]: pvt,
        // but, if it's protected, it can be shared.
        [PROTECTED]: toAccessors(data[PROTECTED], data[PRIVATE]),
        [PUBLIC]: pub,
        [STATIC]: {
            [PRIVATE]: staticPvt,
            [PROTECTED]: toAccessors(data[STATIC][PROTECTED], data[STATIC][PRIVATE]),
            [PUBLIC]: staticPub,
        }
    };
}

/**
 * Searches for the inheritance owed the current class in construction based
 * on the prototype of the base class.
 * @param {Object} obj - top of the prototype chain to search for an object
 * with protected properties.
 * @returns {Object} containing protected properties.
 */
function getInheritance(obj, TYPEID) {
    while (obj && (!protMap.has(obj) || obj.hasOwnProperty(TYPEID))) {
        obj = Object.getPrototypeOf(obj);
    }

    if (obj) {
        return protMap.get(obj);
    }
}

/**
 * Checks the manual and engine call stacks to verify that the currently
 * executing function has the right to access private members.
 * @param {Stack} stack - Stack of registered private member functions in this
 * class that are being executed.
 * @returns {Symbol?} - The TYPEID for the function that's running or undefined.
 */
function validateAccess(stack) {
    let eStack = (new Error).stack.split(/\n/);
    let fn = stack.peek();

    //V8 adds an error-type line in the stack trace.
    if (eStack[0] === "Error")
        eStack.shift();

    if (!eStack[3].includes(fn.name))
        throw new SyntaxError(`Invalid private access specifier encountered.`);

    return owners.get(fn);
}

function isNative(fn) {
    return (typeof(fn) === "function") &&
           fn.hasOwnProperty("prototype") &&
           fn.toString().includes("[native code]");
}

function Super(inst, base, ...args) {
    let idProto = Object.getPrototypeOf(inst);
    let newTarget = function() {},
        proto = Object.getPrototypeOf(idProto);
    if (proto === inst.constructor.prototype) {
        newTarget = inst.constructor;
    }
    else {
        newTarget.prototype = proto;
    }
    
    let newInst = Reflect.construct(base, args, newTarget);
    Object.setPrototypeOf(idProto, newInst);
    if (Object.isExtensible(newInst) && types.has(base)) {
        let typeId = types.get(base);
        if (!newInst.hasOwnProperty(typeId)) {
            Object.defineProperty(newInst, typeId, { value: void 0 });
        }
    }
    return inst;
}

/**
 * Validates the data object and ensures that it meets the minimum requirements
 * to keep from causing errors in this code.
 * @param {Object} data - The data to be adjusted. 
 */
function fixupData(data) {
    let a = new Set([STATIC, PRIVATE, PROTECTED, PUBLIC]);
    a.forEach((entry) => {
        if (data.hasOwnProperty(entry)) {
            let item = data[entry];
            if (item && (typeof(item) !== "object"))
                throw new TypeError(`Expected property "data.${entry}" to be an object.`);
        }
        else {
            data[entry] = {};
        }
    });

    a.delete(STATIC);
    a.forEach((entry) => {
        if (data[STATIC].hasOwnProperty(entry)) {
            let item = data[STATIC][entry];
            if (item && (typeof(item) !== "object"))
                throw new TypeError(`Expected property "data[STATIC].${entry}" to be an object.`);
        }
        else {
            data[STATIC][entry] = {};
        }
    });
}

/**
 * Finds the collection of TYPEID symbols for the ancestors of this class.
 * @param {function} base - Constructor of the base class to start scanning.
 * @param {WeakMap} types - Map holding all the registered TYPEID symbols.
 * @returns {Symbol[]} - 0 or more TYPEID symbols.
 */
function getAncestorIDs(base, types) {
    let retval = [];
    while (base && !types.has(base))
        base = Object.getPrototypeOf(base);

    if (base) {
        retval = types.get(base);
    }

    return retval;
}


/**
 * Produces an extendable function to be used as the base class for another
 * class. This allows a new class to contain prototype-based data while also
 * maintaining privilege levels that can funcm,,tion even inside a Proxy
 * @param {function} base - Base class constructor to used. Defaults to Object.
 * @param {DataSpec} data - Object describing the data that will exist on the
 * prototype and it's corresponding privileges.
 */
module.exports = function Classic(base, data) {
    switch (arguments.length) {
        case 0:
            base = Object;
            data = {};
            break;
        case 1: 
            switch (typeof(base)) {
                case "function":
                    base = {};
                    break;
                case "object":
                    data = base || {};
                    base = Object;
                    break;
                default:
                    throw new TypeError("Invalid argument.");
            }
            break;
        default:
            if (!typeof(base) === "function") {
                throw new TypeError("Parameter 'base' must be a constructor function or undefined.");
            }
            if (!(data && (typeof(data) === "object"))) {
                throw new TypeError("Parameter 'base' must be a constructor function or undefined.");
            }
            break;
    }

    //Make sure data is kosher.
    fixupData(data);

    const TYPEID = Symbol(`base=${base.name}`);
    const handler = {
        get(target, prop, receiver) {
            let retval;
            if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                /**
                 * This is private member request. So the target doesn't matter.
                 * The real target is the prototype object with our TYPEID on it.
                 */
                let typeId = validateAccess(stack);
                let pprop = prop.substr(1);
                let proto = getIdObject(typeId, Object.getPrototypeOf(receiver));

                if (!proto) {
                    throw new TypeError("Receiver does not contain the requested property.")
                }

                let ptarget = pvt.get(proto);
                retval = ptarget[pprop];
            }
            else {
                retval = Reflect.get(target, prop, receiver);
            }
            return retval;
        },
        set(target, prop, value, receiver) {
            let retval = false;
            if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                /**
                 * This is private member request. So the target doesn't matter.
                 * The real target is the prototype object with our TYPEID on it.
                 */
                let typeId = validateAccess(stack);
                let pprop = prop.substr(1);
                let proto = getIdObject(typeId, Object.getPrototypeOf(receiver));

                if (!proto) {
                    throw new TypeError("Receiver does not contain the requested property.");
                }

                validateAccess(stack);
                let ptarget = pvt.get(proto);
                if (pprop in ptarget) {
                    ptarget[pprop] = value;
                    retval = true;
                }
                else {
                    throw new TypeError("Receiver does not contain the requested property.");
                }
            }
            else {
                retval = Reflect.get(target, prop, receiver);
            }
            return retval;
        }
    };
    const instanceHandler = {
        get: handler.get,
        set: handler.set,
        defineProperty(target, prop, desc) {
            let retval;
            if ((typeof(prop) === "string") && (prop[0] === TRIGGER)) {
                throw new SyntaxError(`Use of "${TRIGGER}" disallowed in first character of identifier.`);
            }
            else {
                retval = Reflect.defineProperty(target, prop, desc);
            }
            return retval;
        }
    };

    //Handle data conversion for the private and protected members;
    data = convertPrivates(data, stack, TYPEID);

    let shadow = function ClassBase(...args) {
        let retval, 
            proto = new.target ? new.target.prototype : Object.getPrototypeOf(this),
            ancestor = shadow.prototype.hasOwnProperty("constructor")
                ? shadow.prototype.constructor : base,
            idProto = new Proxy(Object.create(proto, {
                [TYPEID]: { value: void 0 },
                super: {
                    configurable: true,
                    value: function(...args) {
                        return Super(this, base, ...args);
                    }
                }
            }), handler);

        pvt.set(idProto, Object.create(data[PRIVATE]));

        if (new.target) {
            if (isNative(ancestor) || (ancestor === base)) {
                let fake = function() {};
                fake.prototype = idProto;
                Object.setPrototypeOf(idProto, proto);
                retval = Reflect.construct(ancestor, args, fake);
            } 
            else{
                let instance = Object.create(idProto);
                retval = ancestor.apply(new Proxy(instance, instanceHandler), args);
                if (retval === void 0) {
                    retval = instance;
                }
                Object.setPrototypeOf(this, instance);
                retval = this;
            }
        }
        else {
            retval = ancestor.apply(this, args) || this;
            Object.setPrototypeOf(retval, idProto);
        }
        delete idProto.super;
        
        return new Proxy(retval, instanceHandler);
    }

    if (!types.has(base)) {
        types.set(base, Symbol(base.name));
    }
    types.set(shadow, TYPEID);

    shadow.prototype = Object.create(base.prototype, Object.getOwnPropertyDescriptors(data[PUBLIC]));
    protMap.set(shadow.prototype, data[PROTECTED]);
    Object.setPrototypeOf(shadow, base);

    if (shadow.prototype.hasOwnProperty("constructor")) {
        Object.setPrototypeOf(shadow.prototype.constructor, base);
    }

    Object.defineProperties(shadow, Object.getOwnPropertyDescriptors(data[STATIC][PUBLIC]));
    Object.defineProperty(shadow, TYPEID, { value: void 0 });
    shadow = new Proxy(shadow, instanceHandler);
    pvt.set(shadow, Object.create(data[STATIC][PRIVATE]));
    protMap.set(shadow, data[STATIC][PROTECTED]);
    
    let inheritance = getInheritance(base.prototype, TYPEID);
    if (inheritance) {
        Object.setPrototypeOf(data[PROTECTED], inheritance);
        Object.setPrototypeOf(data[PRIVATE], inheritance);
    }
    inheritance = getInheritance(shadow, TYPEID);
    if (inheritance) {
        Object.setPrototypeOf(data[STATIC][PROTECTED], inheritance);
        Object.setPrototypeOf(data[STATIC][PRIVATE], inheritance);
    }

    Object.seal(data[PRIVATE]);
    Object.seal(data[PROTECTED]);
    Object.seal(data[STATIC][PRIVATE]);
    Object.seal(data[STATIC][PROTECTED]);

    if (data[STATIC][PUBLIC].hasOwnProperty("constructor")) {
        data[STATIC][PUBLIC].constructor.call(shadow);
    }

    return shadow;
}
Object.defineProperties(module.exports, {
    "PrivateAccessSpecifier": {
        enumerable: true,
        get() { return TRIGGER; },
        set(v) {
            if ((typeof(v) === "string") && (v.length === 1) &&
                (["_", "$"].includes(v))) {
                TRIGGER = v;
            }
            else {
                throw new TypeError("Invalid private access specifier. Not altered.");
            }
        }
    },
    STATIC: {
        enumerable: true,
        value: Symbol("ClassicJS::STATIC")
    },
    PRIVATE: {
        enumerable: true,
        value: Symbol("ClassicJS::PRIVATE")
    },
    PROTECTED: {
        enumerable: true,
        value: Symbol("ClassicJS::PROTECTED")
    },
    PUBLIC: {
        enumerable: true,
        value: Symbol("ClassicJS::PUBLIC")
    },
    cast: {
        enumerable: true,
        value: function cast(type, inst) {
            let retval;
            if (types.has(type)) {
                let typeId = types.get(type);
                retval = getIdObject(typeId, inst);
            }
            return retval;
        }
    }
}); 

const { STATIC, PRIVATE, PROTECTED, PUBLIC } = module.exports;

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

/**
 * @typedef FlexibleProxy
 * This is a proxy that allows it's target to be altered.
 */
class FlexibleProxy {
    constructor(instance, newTarget, needSuper) {
        return new Proxy(instance, {
            current: instance,
            get(tgt, prop, receiver) {
                let retval;
                switch (prop) {
                    case NEW_TARGET:
                        retval = newTarget;
                        break;
                    case FlexibleProxy.TARGET:
                        retval = this.current;
                        break;
                    case SUPER_CALLED:
                        retval = !needSuper;
                        break;
                    default:
                        if (["super", TARGET].includes(prop) || !needSuper) {
                            retval = Reflect.get(this.current, prop, receiver);
                        }
                        else {
                            throw new SyntaxError("Cannot use 'this' before calling super.")
                        }
                        break;
                }
                return retval;
            },
            set(tgt, prop, value, receiver) {
                let retval = true;
                switch (prop) {
                    case FlexibleProxy.TARGET:
                        this.current = value;
                        break;
                    case SUPER_CALLED:
                        if (needSuper)
                            needSuper = !value;
                        break;
                    default:
                        if (prop === TARGET) {
                            retval = Reflect.set(this.current, prop, value, receiver);
                        }
                        else {
                            throw new SyntaxError("Cannot use 'this' before calling super.");
                        }
                }
                return retval;
            }
        })
    }

    static get TARGET() {
        Object.defineProperty(this, "TARGET", { value: Symbol("TARGET") });
        return this.TARGET;
    }
}

let useStrings = false;
let TRIGGER = '$';

const owners = new WeakMap;     //Owning class TYPEID for each registered function
const pvt = new WeakMap;        //Private data for each instance
const protMap = new WeakMap;    //Inheritable objects from each class
const types = new WeakMap;      //Map of constructors and their TYPEIDs
const initFns = new WeakMap;    //Map of initialization functions
const proxyMap = new WeakMap;   //Map of instances to privileged instances
const stack = new Stack;        //Function registration used to validate access

const TARGET = Symbol("Proxy Target");          //Used to retrieve the target from the proxy
const UNUSED = Symbol("UNUSED");                //Used to ensure that a property isn't found.
const SUPER_CALLED = Symbol("SUPER_CALLED");    //Used to enable normal use of `this`.
const NEW_TARGET = Symbol("NEW_TARGET");        //Used to hide the transfer of new.target from the constructor
const KEYMAP = Symbol("PROTECTED KEYMAP");      //Used to hold the name mapping for inherited protected members.

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
 * Generates a list of names of the protected members while moving the actual
 * definitions of those protected members into the class private object.
 * @param {Object} pvtData - Template of the private data object. Will receive
 * the members of the protData object.
 * @param {Object} protData - Template of the protected data object. Will be
 * replaced by an array of names of the protected members.
 */
function mapProtected(pvtData, protData, name) {
    let retval = {f: {}, r: {}}; //forward & reverse mappings
    let keys = Object.getOwnPropertyNames(protData).concat(Object.getOwnPropertySymbols(protData));
    
    Object.defineProperties(pvtData, Object.getOwnPropertyDescriptors(protData));

    //Generate a 2-way mapping for the protected keys.
    for (let key of keys) {
        retval.f[key] = Symbol(`${name}::${key}`);
        retval.r[retval.f[key]] = key;
    }
    return retval;
}

/**
 * Create a set of accessors that access the private members in data that have
 * been marked as protected.
 * @param {Object} data - The target container to access.
 * @param {Array} keyMap - The map of mangled keys to keys in data.
 * @returns {Object} - An accessor-only version of the prototype data
 */
function toAccessors(data, keyMap) {
    let retval = {};
    let rKeyMap = keyMap.r;
    let keydef = (key => ({
        configurable: true,
        get() {
            return data[rKeyMap[key]]; 
        },
        set(v) {
            Object.defineProperty(this, key, {
                configurable: true,
                writable: true,
                value: v 
            });
        }
    }));

    let keys = Object.getOwnPropertySymbols(rKeyMap);
    for (let key of keys) {
        Object.defineProperty(retval, key, keydef(key));
    }

    return retval;
}

/**
 * Searches the prototype chain for an object containing the given TYPEID
 * @param {Symbol} TYPEID - ID of the targeted class
 * @param {Object} target - instance who's identifying object must be found
 * @returns {Object} - The target idObject or null if not found
 */
function getIdObject(TYPEID, target) {
    let retval = target
    while (retval && !retval.hasOwnProperty(TYPEID)) {
        retval = Object.getPrototypeOf(retval);
    }
    return retval;
}

/**
 * Wraps fn with a uniquely identifiable function that ensures privileged
 * member functions can be identified.
 * @param {function} fn - Target function to wrap
 * @param {Symbol} TYPEID - Unique ID of the class owning fn
 * @param {Function|Object} owner - Constructor or prototype of the owning class.
 * @returns {function} - uniquely named wrapper function
 */
function makePvtName(fn, TYPEID, owner) {
    let name = makeFnName();
    let retval = eval(`
        (function ${name}(...args) {
            let inst = proxyMap.get(this) || this;
            stack.push(${name});
            let retval = fn.apply(inst, args); 
            stack.pop();
            return retval;
        })
    `);

    Object.defineProperties(retval, {
        displayName: {
            value: `${fn.name} wrapper (as ${name})`
        },
        owner: {
            value: owner
        },
        bind: {
            configurable: true,
            writable: true,
            value: function bind(that, ...args) {
                that = that[FlexibleProxy.TARGET] || that;
                return Function.prototype.bind.call(this, that, ...args);
            }
        },
        toString: {
            configurable: true, 
            writable: true,
            value: Function.prototype.toString.bind(fn)
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
 * @param {Symbol} TYPEID - ID of the targeted class
 * @param {Function} ctor - Constructor of the class whose data is being converted.
 * @returns {Object} - Returns a processed version of the prototype object.
 */
function convertPrivates(data, TYPEID, ctor) {
    let pvt = {},
        staticPvt = {},
        prot = {},
        staticProt = {},
        pub = {},
        staticPub = {};

    function convert(dest, src, owner) {
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
                    desc.value = makePvtName(desc.value, TYPEID, owner);
                }
            }
            else {
                if (("get" in desc) && desc.get) {
                    desc.get = makePvtName(desc.get, TYPEID, owner);
                }
                if (("set" in desc) && desc.set) {
                    desc.set = makePvtName(desc.set, TYPEID, owner);
                }
            }
            Object.defineProperty(dest, key, desc);
        }
    }
    
    //Sanity check. Are there unwanted keys?
    function findOrphans(obj, isStatic) {
        let keyset = new Set(Object.getOwnPropertyNames(obj).concat(
            Object.getOwnPropertySymbols(obj)
        ));
        keyset.delete(Classic.PRIVATE);
        keyset.delete(Classic.PROTECTED);
        keyset.delete(Classic.PUBLIC);
        keyset.delete(Classic.CLASSNAME);
        keyset.delete(Classic.INHERITMODE);
        !isStatic && keyset.delete(Classic.STATIC);
    
        if (keyset.size > 0) {
            throw new SyntaxError(`Found orphan ${isStatic?"static ":""}keys: ${Array.from(keyset)}`);
        }    
    }
    findOrphans(data);
    findOrphans(data[Classic.STATIC], true);

    prot = mapProtected(data[Classic.PRIVATE], data[Classic.PROTECTED], data.className);
    staticProt = mapProtected(data[Classic.STATIC][Classic.PRIVATE], data[Classic.STATIC][Classic.PROTECTED], data.className);
    
    convert(pvt, data[Classic.PRIVATE], ctor.prototype);
    convert(pub, data[Classic.PUBLIC], ctor.prototype);
    convert(staticPvt, data[Classic.STATIC][Classic.PRIVATE], ctor);
    convert(staticPub, data[Classic.STATIC][Classic.PUBLIC], ctor);

    return {
        //If it's not public, it's private...
        [Classic.PRIVATE]: pvt,
        // but, if it's protected, it can be shared.
        [Classic.PROTECTED]: prot,
        [Classic.PUBLIC]: pub,
        [Classic.STATIC]: {
            [Classic.PRIVATE]: staticPvt,
            [Classic.PROTECTED]: staticProt,
            [Classic.PUBLIC]: staticPub,
        }
    };
}

/**
 * Searches for the inheritance owed the current class in construction based
 * on the prototype of the base class.
 * @param {Object} pidObj - ID object for the base class of the requesting class.
 * @param {Object} baseKey - Object used to retrieve the protected member name list.
 * @returns {Object} containing protected properties and a map of the class-specific names.
 */
function getInheritance(pidObj, baseKey) {
    let pvtData = pvt.get(pidObj);
    let protNames = protMap.get(baseKey);
    let retval;
    let hasData = obj => {
        let retval = false;
        if (obj) {
            let keys = Object.getOwnPropertyNames(obj).concat(
                Object.getOwnPropertySymbols(obj)
            );
            retval = !!keys.length;
        }
        return retval;
    };

    if (hasData(pvtData) && protNames && hasData(protNames.f)) {
        retval = {
            links: toAccessors(pvtData, protNames),
            map: protNames
        };
        //Inherit any protected members already calculated.
        Object.setPrototypeOf(retval.links, Object.getPrototypeOf(pvtData));
    }
    return retval;
}

/**
 * Checks the manual and engine call stacks to verify that the currently
 * executing function has the right to access private members.
 * @param {Stack} stack - Stack of registered private member functions in this
 * class that are being executed.
 * @param {Number} offset - Count of extra functions in the call stack.
 * @returns {Symbol?} - The TYPEID for the function that's running or undefined.
 */
function validateAccess(stack, offset) {
    let eStack = (new Error).stack.split(/\n/);
    let fn = stack.peek();

    //V8 adds an error-type line in the stack trace.
    if (eStack[0] === "Error")
        eStack.shift();

    if (!eStack[3 + offset].includes(fn.name))
        throw new SyntaxError(`Invalid private access specifier encountered.`);

    return owners.get(fn);
}

/**
 * Checks to see if the passed function is a native function. It's more of a
 * quick guess than a certainty, but it's good enough to avoid getting fooled
 * by the average "bind" usage.
 * @param {function} fn - Any function.
 * @returns {boolean}
 */
function isNative(fn) {
    return (typeof(fn) === "function") &&
           fn.hasOwnProperty("prototype") &&
           fn.toString().includes("[native code]");
}
/**
 * The super constructor-calling function.
 * @param {*} inst - The instance object for the class being constructed
 * @param {*} base - The superclass that needs to be initialized
 * @param  {...any} args - Arguments to the superclass constructor
 * @returns {any} - the result of initializing the superclass
 */
function Super(inst, base, ...args) {
    let idProto = Object.getPrototypeOf(inst);
        proto = Object.getPrototypeOf(idProto);
        pvtData = pvt.get(idProto) || {}
        newTarget = inst[NEW_TARGET];
    
    let newInst = Reflect.construct(base, args, newTarget);
    let typeId = types.get(base).id;
    let bProto = Object.getPrototypeOf(newInst);

    inst[FlexibleProxy.TARGET] = newInst;
    
    if (Object.isExtensible(newInst) && types.has(base) && !(typeId in newInst)) {
        //Create and place an empty private container & idProto for the native instance.
        let bidProto = { __proto__: bProto };
        let data = Object.seal({});
        Object.defineProperty(bidProto, typeId, { value: void 0 });
        pvt.set(Object.seal(bidProto), data);
        Object.setPrototypeOf(idProto, bidProto);
        bProto = bidProto;
    }

    Object.setPrototypeOf(idProto, bProto);
    Object.setPrototypeOf(newInst, idProto);
    
    //Don't forget to link in inherited protected properties.
    let baseIdProto = getIdObject(typeId, newInst);
    let inheritance = getInheritance(baseIdProto, base.prototype);
    if (inheritance) {
        Object.setPrototypeOf(pvtData, inheritance.links);
    }

    runInitializers(idProto, proto);
    runInitializers(pvtData, Object.getPrototypeOf(pvtData));
    return inst;
}

/**
 * Validates the data object and ensures that it meets the minimum requirements
 * to keep from causing errors in this code.
 * @param {Object} data - The data to be adjusted. 
 */
function fixupData(data) {
    let a = new Set([Classic.STATIC, Classic.PRIVATE, Classic.PROTECTED, Classic.PUBLIC]);

    data[Classic.CLASSNAME] = data[Classic.CLASSNAME] || "ClassBase";
    data[Classic.INHERITMODE] = [Classic.ABSTRACT, Classic.FINAL, undefined].includes(data[Classic.INHERITMODE]) 
        ? data[Classic.INHERITMODE]
        : undefined;

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

    a.delete(Classic.STATIC);
    a.forEach((entry) => {
        if (data[Classic.STATIC].hasOwnProperty(entry)) {
            let item = data[Classic.STATIC][entry];
            if (item && (typeof(item) !== "object"))
                throw new TypeError(`Expected property "data[Classic.STATIC].${entry}" to be an object.`);
        }
        else {
            data[Classic.STATIC][entry] = {};
        }
    });
}

/**
 * Finds and runs all initializers associated with the prototype. It stores the
 * returned values on the instance object.
 * @param {Object} inst - the object to run initializers against
 * @param {Object} mProto - the prototype containing properties with values
 * that are initializer keys
 */
function runInitializers(inst, mProto) {
    let keys = Object.getOwnPropertyNames(mProto).concat(
        Object.getOwnPropertySymbols(mProto)
    );
    let isID = pvt.has(inst);

    for (let key of keys) {
        let def = Object.getOwnPropertyDescriptor(mProto, key);
        
        if ("value" in def) {
            let val = (def) ? def.value : undefined;

            if (initFns.has(val)) {
                inst[key] = initFns.get(val).call(this);
            }
            else if (isID && (typeof(val) !== "function")) {
                inst[key] = val;
            }
        }
    }
}

function getInheritedPropertyDescriptor(obj, prop) {
    let retval;
    obj = obj[FlexibleProxy.TARGET] || obj[TARGET] || obj;

    while (obj && (typeof(obj) === "object")) {
        if (obj.hasOwnProperty(prop)) {
            retval = Object.getOwnPropertyDescriptor(obj, prop);
            break;
        }
        else {
            obj = Object.getPrototypeOf(obj);
            if (obj) {
                obj = obj[FlexibleProxy.TARGET] || obj[TARGET] || obj;
            }
        }
    }

    return retval;
}

/**
 * Produces an extendable function to be used as the base class for another
 * class. This allows a new class to contain prototype-based data while also
 * maintaining privilege levels that work properly even inside a Proxy.
 * @param {function?} base - Base class constructor to used. Defaults to Object.
 * @param {DataSpec} data - Object describing the data that will exist on the
 * prototype and it's corresponding privileges.
 * @returns {function} - The constructor for the newly defined class. 
 * 
 * @property {string} PrivateAccessSpecifier - Used to set the identifier
 * character that is used to access non-public members. Can be either '$' or
 * '_'. Defaults to '$'.
 * @property {boolean} UseStrings - If set to true, the data parameter can use
 * the strings "public", "protected", "private", & "static" to define the
 * sections instead of their symbolic counterparts. Defaults to false.
 * @property {function} init - Used to defer property assignment until an
 * instance is created. Causes each instance to receive a unique copy unless
 * the function is crafted to return the same value each call.
 * @property {function} getInitValue - Used to retrieve an initialization value
 * for a prototype property that was initialized with `Classic.init`.
 * @property {Symbol} PLACEHOLDER - Used to identify prototype properties that
 * were created with `Classic.init` and can be used with `Classic.getInitValue`.
 * @property {Symbol|string} STATIC - Used to specify properties belonging to
 * the constructor function. Can only contain the other 3 section constants.
 * @property {Symbol|string} PRIVATE - Used to specify properties that will only
 * be accessible by the declaring class.
 * @property {Symbol|string} PROTECTED - Used to specify properties that will be
 * accessible to the declaring class and its descendants.
 * @property {Symbol|string} PUBLIC - Used to specify properties that will be
 * openly accessible.
 */
let instID = 0;
function Classic(base, data) {
    const PROTOTYPE = Symbol("PROTOTYPE");
    switch (arguments.length) {
        case 0:
            base = Object;
            data = {};
            break;
        case 1: 
            switch (typeof(base)) {
                case "function":
                    data = {};
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

    if (types.has(base) && (types.get(base).mode === Classic.FINAL)) {
        throw new TypeError("Cannot extend a final class.");
    }

    const TYPEID = Symbol(`${data[Classic.CLASSNAME] || `<anonymous> extends ${base.name}`} ${++instID}H`);
    const handler = {
        createSuper(receiver, offset) {
            let { ptarget } = this.privateAccess("", receiver, offset);
            let retval = function _super_(className) {
                let retval = base.prototype;
                if (className) {
                    let target = base;

                    while (target && (target.name !== className)) {
                        target = Object.getPrototypeOf(target);
                    }

                    if (target) {
                        retval = target.prototype;
                    }
                }
                retval = new FlexibleProxy(retval, getInstanceHandler(false));
                retval[TARGET] = receiver;
                return retval;
            };
            let newProto = (typeof(receiver) === "function") 
                ? base || null 
                : (base) 
                    ? base.prototype
                    : null;
            Object.setPrototypeOf(retval, newProto);
            retval = new Proxy(retval, getInstanceHandler(false));

            return retval;
        },
        privateAccess(prop, receiver, offset) {
            /**
             * This is private member request. So the target doesn't matter.
             * The real target is the prototype object with our TYPEID on it.
             */
            let typeId = validateAccess(stack, offset);
            let pprop = prop.substr(1);
            // let rproto = (typeof(receiver) === "function")
            //     ? Object.getPrototypeOf(receiver)
            //     : receiver;
            let proto = getIdObject(typeId, receiver);
            let mapKey = (typeof receiver === "function")
                ? receiver
                : Object.getPrototypeOf(receiver);

            if (!proto) {
                if (typeof(receiver) === "function") {
                    proto = receiver;
                    mapKey = receiver;
                }
                else {
                    throw new TypeError("Receiver does not contain the requested property.")
                }
            }

            let ptarget = pvt.get(proto);
            let nameMap = (protMap.get(mapKey) || {}).f;

            //Remapping to prevent cousin class leakage.
            if (ptarget && !ptarget.hasOwnProperty(pprop) && nameMap && (pprop in nameMap)) {
                pprop = nameMap[pprop];
            }

            return { ptarget, pprop };

        },
        get(target, prop, receiver, offset) {
            let retval;
            offset = offset || 0;

            if (prop === TARGET) {
                retval = target;
            }
            else if ((prop === "super") && (target[SUPER_CALLED] !== false)) {
                if (target.hasOwnProperty(prop)) {
                    retval = Reflect.get(target, prop, receiver);
                }
                else {
                    retval = this.createSuper(target, offset + 2);
                }
            }
            else if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                let { ptarget, pprop } = this.privateAccess(prop, target, offset + 1);

                if (pprop === "class$") {
                    retval = shadow;
                }
                else {
                    retval = ptarget[pprop];
                }
            }
            else {
                let desc = getInheritedPropertyDescriptor(target, prop);
                if (desc && desc.get && !/_\$\d{4,}\$_/.test(desc.get.name)) {
                    let context = receiver[FlexibleProxy.TARGET] || receiver[TARGET] || target;
                    retval = desc.get.call(context);
                }
                else {
                    retval = Reflect.get(target, prop, receiver);
                }
            }
            return retval;
        },
        set(target, prop, value, receiver, offset) {
            let retval = false;
            offset = offset || 0;

            if ((typeof(prop) == "string") && (prop[0] === TRIGGER)) {
                let { ptarget, pprop } = this.privateAccess(prop, receiver, offset + 1);

                if (pprop in ptarget) {
                    ptarget[pprop] = value;
                    retval = true;
                }
                else {
                    throw new TypeError("Receiver does not contain the requested property.");
                }
            }
            else {
                let desc = getInheritedPropertyDescriptor(target, prop);
                if (desc && desc.set && !/_\$\d{4,}\$_/.test(desc.set.name)) {
                    let context = receiver[FlexibleProxy.TARGET] || receiver[TARGET] || target;
                    desc.set.call(context, value);
                    retval = true;
                }
                else {
                    retval = Reflect.set(target, prop, value, receiver);
                }
            }
            return retval;
        }
    };

    function getInstanceHandler(needSuper) {
        return {
            target: void 0,
            needSuper: !!needSuper,
            top_proto: null,
            originalProto: null,
            get(target, prop, receiver) {
                let retval;
                let fpTarget = target[FlexibleProxy.TARGET];
                if (prop === SUPER_CALLED) {
                    this.needSuper = false;
                }
                if (this.needSuper && ![NEW_TARGET, "super"].includes(prop) &&
                    !((typeof(target) === "function") && types.has(target))) {
                    throw new SyntaxError('Must call "this.super()" before using `this`');
                }

                if ((prop === "prototype") && this.top_proto) {
                    retval = this.top_proto;
                }
                else {
                    if (this.target && !this.target.hasOwnProperty(prop)) {
                        prop = UNUSED;
                    }
                    
                    retval = handler.get(target, prop, receiver, 1);
                }

                if (![NEW_TARGET, "__proto__"].includes(prop) && 
                    (typeof(retval) === "function") && 
                    !/_\$\d{4,}\$_/.test(retval.name) &&
                    ("_super" !== retval.name) &&
                    (Function.prototype[retval.name] !== retval) &&
                    (Object.prototype[retval.name] !== retval)) {
                    retval = Function.prototype.bind.call(retval, fpTarget || target);
                }

                return retval;
            },
            set(target, prop, value, receiver) {
                let retval = false;

                if (this.needSuper && (prop !== "super"))
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                if (prop === PROTOTYPE) {
                    this.top_proto = value;
                    retval = true;
                }
                else {
                    retval = handler.set(target, prop, value, receiver, 1);
                }

                return retval;
            },
            ownKeys(target) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                let retval;
                if (this.target) {
                    retval = Reflect.ownKeys(this.target);
                }
                else {
                    retval = Reflect.ownKeys(target);
                }
                return retval;
            },
            has(target, key) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                let retval;
                if (this.target) {
                    retval = Reflect.has(this.target, key);
                }
                else {
                    retval = Reflect.has(target, key);
                }
                return retval;
            },
            defineProperty(target, prop, desc) {
                if (this.needsSuper)
                    throw new SyntaxError('Must call "this.super()" before using `this`');

                let retval;
                if ((typeof(prop) === "string") && (prop[0] === TRIGGER)) {
                    throw new SyntaxError(`Use of "${TRIGGER}" disallowed in first character of identifier.`);
                }
                else {
                    retval = Reflect.defineProperty(target, prop, desc);
                }
                return retval;
            },
            apply(target, context, args) {
                let fn = target[TARGET] || target;
                this.target = getIdObject(owners.get(fn), context);
                let retval = Reflect.apply(fn, context, args);
                this.target = void 0;
                return retval;
            }
        };
    }

    //Handle data conversion for the private and protected members;

    let className = data[Classic.CLASSNAME];
    let inheritMode = data[Classic.INHERITMODE];
    let shadow;
    eval(`
    shadow = function ${className}(...args) {
        let proto = /*new.target ? new.target.prototype : */Object.getPrototypeOf(this);

        if ((inheritMode === Classic.ABSTRACT) && (proto === shadow.prototype)) {
            throw new TypeError("Cannot instantiate an abstract class.");
        }
        else if ((inheritMode === Classic.FINAL) && (proto !== shadow.protoype)) {
            throw new TypeError("Cannot extend a final class.");
        }

        let hasCtor = shadow.prototype.hasOwnProperty("constructor");
        let retval, 
            baseTypeId = types.get(base).id,
            ancestor = hasCtor ? shadow.prototype.constructor : base,
            rawIdProto = Object.create(proto, {
                [TYPEID]: { value: void 0 },
                super: {
                    configurable: true,
                    value: function _super(...args) {
                        this[SUPER_CALLED] = true;
                        return Super(this, base, ...args);
                    }
                }
            }),
            idProto = new Proxy(rawIdProto, handler);

        let pvtData = Object.assign({}, data[Classic.PRIVATE]);
        pvt.set(idProto, pvtData);
        pvt.set(rawIdProto, pvtData);

        runInitializers(idProto, shadow.prototype);
        runInitializers(pvtData, data[Classic.PRIVATE]);
        
        let newTarget = new.target || this[NEW_TARGET];
        if (newTarget) {
            //Didn't provide a public constructor function
            if (isNative(ancestor) || (ancestor === base)) {
                Object.setPrototypeOf(idProto, proto);
                newTarget[PROTOTYPE] = idProto;
                retval = Reflect.construct(ancestor, args, newTarget);
                newTarget[PROTOTYPE] = null;
                if (!hasCtor) {
                    Object.defineProperty(retval, baseTypeId, { value: void 0 });
                }
            } 
            else { //Provided a public constructor
                let needSuper = (base !== Object) && (ancestor !== base);
                let instance = new FlexibleProxy(Object.create(idProto, {fake: {value: true}}), newTarget, needSuper);
                retval = ancestor.apply(new Proxy(instance, getInstanceHandler()), args);
                if (retval === void 0) {
                    retval = instance[FlexibleProxy.TARGET];
                }
            }
        }
        else {
            retval = ancestor.apply(this, args) || this;
        }

        delete rawIdProto.super;
        
        let inheritance = getInheritance(Object.getPrototypeOf(retval), base.prototype);
        if (inheritance) {
            Object.setPrototypeOf(pvtData, inheritance.links);
        }        
        
        
        //Save a proxy to use internally. Yup, it's an inverse membrane!
        proxyMap.set(retval, new Proxy(retval, getInstanceHandler()));

        //Return the unproxied version.
        return retval;
    }
    `);
    
    let pShadow = new Proxy(shadow, getInstanceHandler());
    data = convertPrivates(data, TYPEID, pShadow);

    let spvtData = Object.assign({}, data[Classic.STATIC][Classic.PRIVATE]);
    let protNameMap = data[Classic.STATIC][Classic.PROTECTED];

    types.set(shadow, {id: TYPEID, mode: inheritMode});
    types.set(pShadow, {id: TYPEID, mode: inheritMode});

    if (!types.has(base)) {
        types.set(base, {id: Symbol(`${base.name} ${++instID}L`)});
    }

    Object.defineProperty(shadow, Symbol.hasInstance, {
        enumerable: true,
        value: function(instance) {
            let target = this[TARGET];
            return (types.has(target) && !!getIdObject(types.get(target).id, instance));
        }
    });
    
    shadow.prototype = Object.create(base.prototype, Object.getOwnPropertyDescriptors(data[Classic.PUBLIC]));
    protMap.set(shadow.prototype, data[Classic.PROTECTED]);
    Object.setPrototypeOf(shadow, base);

    if (shadow.prototype.hasOwnProperty("constructor")) {
        Object.setPrototypeOf(shadow.prototype.constructor, base);
    }

    Object.defineProperties(shadow, Object.getOwnPropertyDescriptors(data[Classic.STATIC][Classic.PUBLIC]));
    Object.defineProperty(shadow, TYPEID, { value: void 0 });
    
    pvt.set(shadow, spvtData);
    pvt.set(pShadow, spvtData);
    protMap.set(shadow, protNameMap);
    protMap.set(pShadow, protNameMap);
    
    //Get the inheritance for the static object.
    inheritance = getInheritance(base, base);
    if (inheritance) {
        Object.setPrototypeOf(spvtData, inheritance.links);
        Object.setPrototypeOf(protNameMap.f, inheritance.map.f);
        Object.setPrototypeOf(protNameMap.r, inheritance.map.r);
    }

    let bprotNameMap = protMap.get(base.prototype);
    if (bprotNameMap) {
        Object.setPrototypeOf(data[Classic.PROTECTED].f, bprotNameMap.f);
        Object.setPrototypeOf(data[Classic.PROTECTED].r, bprotNameMap.r);
    }

    Object.seal(data[Classic.PRIVATE]);
    Object.seal(data[Classic.PROTECTED]);
    Object.seal(data[Classic.STATIC][Classic.PRIVATE]);
    Object.seal(data[Classic.STATIC][Classic.PROTECTED]);

    if (data[Classic.STATIC][Classic.PUBLIC].hasOwnProperty("constructor")) {
        data[Classic.STATIC][Classic.PUBLIC].constructor.call(pShadow);
    }

    return pShadow;
}

const AccessLevels = {
    Private: Symbol("ClassicJS::PRIVATE"),
    Protected: Symbol("ClassicJS::PROTECTED"),
    Public: Symbol("ClassicJS::PUBLIC"),
    Static: Symbol("ClassicJS::STATIC")
};

const ClassConfigKeys = {
    ClassName: Symbol("ClassicJS::CLASSNAME"),
    InheritMode: Symbol("ClassicJS::INHERITMODE")
};

Object.defineProperties(Classic, {
    PrivateAccessSpecifier: {
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
    /**
     * 
     */
    UseStrings: {
        enumerable: true,
        get() { return useStrings; },
        set(v) { useStrings = !!v; }
    },
    STATIC: {
        enumerable: true,
        get() { return useStrings ? "static" : AccessLevels.Static; }
    },
    PRIVATE: {
        enumerable: true,
        get() { return useStrings ? "private" : AccessLevels.Private; }
    },
    PROTECTED: {
        enumerable: true,
        get() { return useStrings ? "protected" : AccessLevels.Protected; }
    },
    PUBLIC: {
        enumerable: true,
        get() { return useStrings ? "public" : AccessLevels.Public; }
    },
    CLASSNAME: {
        enumerable: true,
        get() { return useStrings ? "className" : ClassConfigKeys.CLASSNAME; }
    },
    INHERITMODE: {
        enumerable: true,
        get() { return useStrings ? "inheritMode" : ClassConfigKeys.INHERITMODE; }
    },
    PLACEHOLDER: {
        enumerable: true,
        value: Symbol(`Initializer PlaceHolder`)
    },
    ABSTRACT: {
        enumerable: true,
        get() { return useStrings ? "abstract" : ClassConfigKeys.ABSTRACT; }
    },
    FINAL: {
        enumerable: true,
        get() { return useStrings ? "final" : ClassConfigKeys.FINAL; }
    },
    init: {
        enumerable: true,
        value: function init(fn) {
            let retval = Object.freeze(Object.create(Object.prototype, {
                [Classic.PLACEHOLDER]: { value: void 0}
            }));
            initFns.set(retval, fn);
            return retval;
        }
    },
    getInitValue: {
        enumerable: true,
        value: function getInitValue(placeholder) {
            if (initFns.has(placeholder))
                return initFns.get(placeholder)();
        }
    }
}); 

module.exports = Classic;

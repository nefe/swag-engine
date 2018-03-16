import * as _ from "lodash";
import * as debugLog from "./debugLog";
import {
  getModelByRef,
  getIdentifierFromUrl,
  getMaxSamePath,
  getIdentifierFromOperatorId,
  transformDescription
} from "./utils";

export enum Type {
  integer = "integer",
  string = "string",
  array = "array",
  number = "number",
  boolean = "boolean",
  object = "object"
}

export class Property {
  type: Type;
  enum? = [] as string[];
  items? = null as {
    type?: Type;
    $ref?: string;
  };
  $ref? = "";
  description? = "";
  name: string;
  required: boolean;

  constructor(prop) {
    this.type = prop.type;
    this.enum = prop.enum;
    this.name = prop.name;
    this.items = prop.items;
    this.$ref = prop.$ref;
    this.description = prop.description;
    this.required = prop.required;
  }

  get dep() {
    if (this.$ref) {
      const name = getModelByRef(this.$ref).slice(5);

      if (name !== this.name) {
        return name;
      }
    }
    if (this.items && this.items.$ref) {
      const name = getModelByRef(this.items.$ref).slice(5);

      if (name !== this.name) {
        return name;
      }
    }
    return "";
  }

  get finalType() {
    if (this.enum) {
      const isStrNum = str => !Number.isNaN(Number(str));
      const numEnums = this.enum
        .map(str => Number(str))
        .filter(num => !Number.isNaN(num));

      const enumItems = [
        ...numEnums,
        ...this.enum.map(enumItem => `'${enumItem}'`)
      ];

      return enumItems.join(" | ");
    }
    if (this.$ref) {
      return getModelByRef(this.$ref);
    }

    if (this.type === Type.array) {
      if (this.items.type === Type.boolean) {
        return `boolean[]`;
      }
      if (this.items.type === Type.number || this.items.type === Type.integer) {
        return `number[]`;
      }
      if (this.items.type === Type.string) {
        return `string[]`;
      }
      if (this.items.$ref) {
        const ref = getModelByRef(this.items.$ref);
        return `${ref}[]`;
      }
      return "any[]";
    }
    if (this.type === Type.integer) {
      return "number";
    }

    return this.type;
  }

  get initialValue() {
    if (this.$ref) {
      let finalType = getModelByRef(this.$ref);
      finalType = finalType.slice("defs.".length);

      return `new ${finalType}()`;
    }

    if (this.type === Type.array) {
      return "[]";
    }

    if (this.type === Type.string) {
      return "''";
    }

    return "";
  }

  /** 获取 class 值字符串 */
  static toValueClass(
    className: string,
    properties: Property[],
    hasDef = true
  ) {
    if (className.includes("«")) {
      className = className.slice(0, className.indexOf("«"));
    }

    return `
      class ${className} {
        ${_.map(properties, property => {
          let initialValue = property.initialValue;

          if (`new ${className}()` === initialValue) {
            initialValue = `{} as ${className}`;
          }

          if (initialValue) {
            return `
                ${property.description ? `/** ${property.description} */` : ""}
                ${property.name} = ${initialValue}
              `;
          }
        }).join("\n")}
      }
    `;
  }

  /** 获取内联 interface 字符串 */
  static toClass(className: string, properties: Property[], hasDef = true) {
    const deps = _.uniq(_.compact(_.map(properties, property => property.dep)));

    if (className.includes("«")) {
      className = className.slice(0, className.indexOf("«"));
    }

    return `
      class ${className} {
        ${_.map(properties, property => {
          let finalType = property.finalType;
          if (!hasDef && finalType.startsWith("defs.")) {
            finalType = finalType.slice("defs.".length);
          }
          return `
							${property.description ? `/** ${property.description} */` : ""}
							${property.name}${property.required ? "" : "?"}: ${finalType}
						`;
        }).join("\n")}
      }
    `;
  }
}

export class Parameter {
  /** 字段名 */
  name = "";

  in: "query" | "body" | "path";

  /** 描述 */
  description = "";

  /** 是否必填 */
  required: boolean;

  /** 类型 */
  type: Type;

  items? = null as {
    type?: Type;
    $ref?: string;
  };

  schema: {
    $ref: string;
    items?: {
      type?: string;
    };
    type: string;
  };

  constructor(param: Parameter) {
    this.name = param.name;
    this.in = param.in;
    this.description = param.description;
    this.required = param.required;
    this.type = param.type;
    this.items = param.items;
    this.schema = param.schema;
  }

  get finalType() {
    if (this.schema && this.schema.$ref) {
      return getModelByRef(this.schema.$ref);
    }

    if (this.schema && this.schema.type && this.schema.type !== Type.array) {
      return this.schema.type;
    }

    if (this.type === Type.array) {
      if (!this.items) {
        return "any[]";
      }

      if (this.items.type === Type.boolean) {
        return `boolean[]`;
      }
      if (this.items.type === Type.number || this.items.type === Type.integer) {
        return `number[]`;
      }
      if (this.items.type === Type.string) {
        return `string[]`;
      }
      if (this.items.$ref) {
        const ref = getModelByRef(this.items.$ref);
        return `${ref}[]`;
      }
      return "any[]";
    }
    if (this.type === Type.integer) {
      return "number";
    }
    if (this.schema && this.schema.type === Type.array) {
      const itemType = this.schema.items && this.schema.items.type;

      if (itemType === Type.number || itemType === Type.integer) {
        return "number[]";
      }

      if (itemType === Type.string) {
        return "string[]";
      }

      return "any[]";
    }

    return this.type || "any";
  }

  /** 获取 body 参数 */
  static toBody(params: Parameter[]) {
    const bodyParams = params.filter(param => param.in === "body");

    return bodyParams.map(bodyParam => bodyParam.finalType).join(" & ");
  }

  /** 获取内联 interface 字符串 */
  static toClass(params: Parameter[]) {
    return `
      class Params {
        ${_.map(params, param => {
          if (param.in === "body") {
            return "";
          }

          return `
            ${
              param.description
                ? `/** 
						 * ${param.description}
						 */`
                : ""
            }
            ${param.name}${param.required ? "" : "?"}: ${param.finalType}
          `;
        }).join("\n")}
      }
    `;
  }
}

export class Interface {
  consumes = [] as string[];

  parameters = [] as Parameter[];

  get bodyParams() {
    return Parameter.toBody(this.parameters);
  }

  summary = "";

  description: string;

  initialValue: string;

  tags = [] as string[];

  response: Schema;

  method: string;

  name: string;

  path: string;

  samePath: string;

  operationId: string;

  get def() {
    return this.response.dep;
  }

  constructor(inter: Interface) {
    this.consumes = inter.consumes;
    this.parameters = inter.parameters;
    this.summary = inter.summary;
    this.tags = inter.tags;

    this.response = new Schema(inter.response);
    this.method = inter.method;
    this.path = inter.path;

    if (inter.operationId) {
      this.operationId = inter.operationId;
    }

    if (inter.name) {
      this.name = inter.name;
    }
  }

  get paramsType() {
    return Parameter.toClass(this.parameters);
  }

  get responseType() {
    return this.response.finalType;
  }
}

export class Schema {
  type: Type;
  items: {
    type: Type;
    $ref: string;
  };
  $ref: string;

  constructor(instance = {} as any) {
    const { type, items, $ref } = instance;
    this.type = type;
    this.items = items || [];
    this.$ref = $ref;
  }

  get dep() {
    if (this.$ref) {
      return getModelByRef(this.$ref);
    }

    if (this.items.$ref) {
      return getModelByRef(this.items.$ref);
    }

    return "";
  }

  get initialValue() {
    if (this.$ref) {
      return `new ${getModelByRef(this.$ref)}()`;
    }

    if (this.type === Type.array) {
      return "[]";
    }

    return "";
  }

  get finalType() {
    if (this.$ref) {
      return getModelByRef(this.$ref);
    }

    if (this.type === Type.array) {
      if (this.items.type === Type.boolean) {
        return `boolean[]`;
      }
      if (this.items.type === Type.number || this.items.type === Type.integer) {
        return `number[]`;
      }
      if (this.items.type === Type.string) {
        return `string[]`;
      }
      if (this.items.$ref) {
        const ref = getModelByRef(this.items.$ref);
        return `${ref}[]`;
      }
      return "any[]";
    }
    if (this.type === Type.integer) {
      return "number";
    }

    return this.type || "any";
  }
}

export class Mod {
  description: string;
  interfaces: Interface[];
  name: string;
  feOwners: string[];
  beOwners: string[];
}

/** API 源数据 */
export class DataSource {
  paths: {
    [key in string]: {
      put: Interface;
      delete: Interface;
      post: Interface;
      get: Interface;
    }
  };
  tags: { name: string; description: string }[];
  definitions: {
    [key in string]: {
      description: string;
      required?: string[];
      properties: { [key in string]: Property };
    }
  };
}

export enum DiffType {
  变更,
  新增,
  已删除
}

export interface Definition {
  name: string;
  description: string;
  properties: Property[];
  required: string[];
  type: DiffType;
  /** 直接影响的基类 */
  infs: Definition[];
  /** 直接影响的模块 */
  modInfs: Mod[];
  /** 间接影响的基类 */
  indirectInfs: Definition[];
  /** 间接影响的模块 */
  indirectModInfs: Mod[];
}

/** API 加工后的数据 */
export class DataStructure {
  mods: Mod[];

  definitions: Definition[];

  serialize() {
    return JSON.stringify(
      {
        mods: this.mods,
        definitions: this.definitions.map(def => {
          const { infs, modInfs, indirectModInfs, indirectInfs, ...rest } = def;

          return rest;
        })
      },
      null,
      2
    );
  }

  static getDataFromLock(data: DataStructure) {
    const instance = new DataStructure();

    instance.mods = data.mods.map(originMod => {
      const mod = new Mod();

      mod.interfaces = originMod.interfaces.map(originInter => {
        const inter = new Interface(originInter);

        inter.samePath = originInter.samePath;
        inter.parameters = originInter.parameters.map(param => {
          return new Parameter(param);
        });
        return inter;
      });
      mod.name = originMod.name;
      mod.description = originMod.description;
      const feMatch = mod.description.match(/前端:((.)*)\]/);
      const beMatch = mod.description.match(/后端:((.)*);/);
      mod.feOwners = feMatch && feMatch[1].split(",");
      mod.beOwners = beMatch && beMatch[1].split(",");

      return mod;
    });
    instance.definitions = data.definitions.map(originDef => {
      const properties = originDef.properties.map(originProp => {
        return new Property(originProp);
      });

      return {
        properties,
        name: originDef.name,
        description: originDef.description
      } as Definition;
    });

    return instance;
  }

  log = (message?: string) => {};

  updateMod(mod: Mod, onLog?) {
    this.log = debugLog.bindInfo(onLog);
    const isExists = this.mods.find(iMod => iMod.name === mod.name);
    if (isExists) {
      this.log(
        `模块 ${mod.name}(${mod.description}) 已存在。swag 将更新该模块`
      );
      const index = this.mods.findIndex(iMod => iMod.name === mod.name);

      this.mods[index] = mod;
    } else {
      this.log(
        `模块 ${mod.name}(${mod.description}) 不存在。swag 将创建该模块`
      );

      this.mods.push(mod);
    }
  }

  updateDefinition(def: Definition, onLog?) {
    this.log = debugLog.bindInfo(onLog);
    const isExists = this.definitions.find(iDef => iDef.name === def.name);

    if (isExists) {
      this.log(`基类 ${def.name} 已存在。swag 将更新该基类`);
      const index = this.definitions.findIndex(iMod => iMod.name === def.name);

      this.definitions[index] = def;
    } else {
      this.log(`基类 ${def.name} 不存在。swag 将创建该基类`);

      this.definitions.push(def);
    }
  }

  constructor(data?: DataSource) {
    if (!data) {
      return;
    }

    this.mods = data.tags.map(tag => {
      let inters = _.flatten(
        _.map(data.paths, (pathInters, path) => {
          return _.map(pathInters, (inter, method) => {
            return new Interface({
              ...inter,
              parameters: _.uniqBy(
                (inter.parameters || []).map(param => {
                  if (param.description) {
                    param.description = param.description
                      .split("\n")
                      .map(
                        (line, lineIndex) => (lineIndex ? `* ${line}` : line)
                      )
                      .join("\n");
                  }

                  return new Parameter(param);
                }),
                "name"
              ),
              method,
              path,
              response: (inter as any).responses["200"].schema
            });
          });
        })
      ).filter(inter => {
        return (inter.tags as any).includes(tag.name);
      });

      const mod = new Mod();
      mod.interfaces = inters;

      const samePath = getMaxSamePath(
        mod.interfaces.map(inter => inter.path.slice(1))
      );
      mod.interfaces.forEach(inter => {
        inter.name = getIdentifierFromUrl(inter.path, inter.method, samePath);
        inter.samePath = samePath;
      });
      mod.interfaces = _.uniqBy(mod.interfaces, "name");
      mod.description = tag.name;
      const feMatch = tag.name.match(/前端:((.)*)\]/);
      const beMatch = tag.name.match(/后端:((.)*);/);
      mod.feOwners = feMatch && feMatch[1].split(",");
      mod.beOwners = beMatch && beMatch[1].split(",");

      if (tag.description.includes(" ")) {
        tag.description = tag.description.slice(
          0,
          tag.description.indexOf(" ")
        );
      }

      // TODO 这里暂时先做特殊处理。目前 tag 的 description 是有问题的，要做特殊处理。
      // 并且这里暂时混用了 description 和 name。需要后端配合才能解决
      mod.name = transformDescription(tag.description);

      return mod;
    });
    this.mods = _.uniqBy(this.mods, "name");
    this.definitions = _.unionBy(
      _.map(data.definitions, (def, defName) => {
        if (defName.includes("«")) {
          defName = defName.slice(0, defName.indexOf("«"));
        }
        const required = def.required || [];

        return {
          name: defName,
          properties: _.map(def.properties, (prop, propName) => {
            return new Property({
              ...prop,
              required: required.includes(propName) ? true : false,
              name: propName
            });
          }),
          description: def.description
        } as Definition;
      }),
      "name"
    );
  }
}

export interface Template {
  implement(inter: Interface): string;
  header(inter: Interface): string;
  commonHeader(): string;
}

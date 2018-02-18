import {
  DataSource,
  Property,
  DataStructure,
  Mod,
  DiffType,
  Definition,
  Interface,
  Template
} from "./define";
import {
  getConfig,
  clearPath,
  getTemplate,
  Config,
  format,
  setDefinitionInfs
} from "./utils";
import { diff, Model } from "./diff";
import fetch from "node-fetch";
import * as path from "path";
import * as fs from "fs";
import * as _ from "lodash";
import * as debug from "./debugLog";
import { read } from "fs-extra";

const PROJECT_ROOT = process.cwd();

function wait(ttl = 50) {
  return new Promise(resolve => setTimeout(resolve, ttl));
}

interface ModDiffItem extends Mod {
  type: DiffType;
  name: string;
}
interface DefDiffItem extends Definition {
  type: DiffType;
  name: string;
}

export class Cmd {
  rootPath?: string;
  config: Config;
  dataStructure: DataStructure;
  newDataStructure: DataStructure;

  syncNew() {
    return fetch(this.config.originUrl)
      .then(data => data.json())
      .then((data: DataSource) => {
        this.newDataStructure = new DataStructure(data);
        // this.dataStructure = this.newDataStructure;
      });
  }

  diffs = {
    modDiffs: [] as Model[],
    boDiffs: [] as Model[]
  };

  diff() {
    const modDiffs = diff(
      this.dataStructure.mods as any,
      this.newDataStructure.mods as any,
      true
    );

    setDefinitionInfs(
      this.newDataStructure.definitions,
      this.newDataStructure.mods
    );
    const boDiffs = diff(
      this.dataStructure.definitions as any,
      this.newDataStructure.definitions as any,
      false
    );

    this.diffs = { modDiffs, boDiffs };
  }

  save() {
    console.log(this.getPath(this.config.lockPath), "created");
    const content = this.serialize();
    fs.writeFileSync(this.getPath(this.config.lockPath), content, "utf8");
    this.dataStructure = DataStructure.getDataFromLock(JSON.parse(content));
  }

  serialize() {
    return this.dataStructure.serialize();
  }

  ready() {
    if (
      fs.existsSync(this.getPath()) &&
      fs.existsSync(this.getPath(this.config.lockPath))
    ) {
      const fileData = fs.readFileSync(
        this.getPath(this.config.lockPath),
        "utf8"
      );
      const dataStructure = DataStructure.getDataFromLock(JSON.parse(fileData));

      this.dataStructure = dataStructure;
      return Promise.resolve();
    } else {
      return fetch(this.config.originUrl)
        .then(data => data.json())
        .then((data: DataSource) => {
          this.dataStructure = new DataStructure(data);
          this.write();
          this.save();
        });
    }
  }

  log = debug.info;

  updateAll() {
    this.dataStructure = this.newDataStructure;
  }

  updateMod(mod: Mod, onLog?) {
    this.dataStructure.updateMod(mod, onLog);
    this.log = debug.bindInfo(onLog);
  }

  updateDef(def: Definition, onLog?) {
    this.dataStructure.updateDefinition(def, onLog);
    this.log = debug.bindInfo(onLog);
  }

  constructor(rootPath?: string, config?: any) {
    this.rootPath = rootPath;
    this.config = getConfig(config);
  }

  getPath(specPath: string = "") {
    if (!specPath) {
      return path.join(this.rootPath || PROJECT_ROOT, this.config.outDir);
    }

    return path.join(
      this.rootPath || PROJECT_ROOT,
      this.config.outDir,
      specPath
    );
  }

  async format(code: string) {
    return format(code, this.config.prettierConfig);
  }

  async writeFile(filePath, code: string) {
    const formattedCode = await this.format(code);
    fs.writeFileSync(this.getPath(filePath), formattedCode);
  }

  async write() {
    this.log(`${this.config.outDir}文件夹清空中`);
    clearPath(this.getPath());

    await wait();
    this.log(`更新基类中`);
    this.writeDefinetions();
    await wait();
    this.log(`更新定义文件中`);
    this.writeNamespace();
    await wait();
    this.log(`更新接口文件中`);
    this.writeInterfaces();
  }

  writeInterfaces() {
    const mods = this.dataStructure.mods;
    const template = getTemplate(this.config.templatePath, this.rootPath);

    try {
      mods.forEach(mod => {
        /** 创建文件夹 */
        clearPath(this.getPath(mod.name));

        mod.interfaces.forEach(inter => {
          try {
            this.writeFile(
              mod.name + "/" + inter.name + ".ts",
              template.implement({
                ...inter,
                bodyParams: inter.bodyParams,
                paramsType: inter.paramsType,
                responseType: inter.responseType,
                initialValue: inter.response.initialValue || "undefined",
                method: inter.method.toUpperCase(),
                description: inter.summary
              })
            );
          } catch (e) {
            console.log(e, e.error, e.message, e.stack);
          }
        });

        this.writeFile(
          mod.name + "/index.ts",
          `
					${mod.interfaces
            .map(inter => `import * as ${inter.name} from './${inter.name}';`)
            .join("\n")}

					export {
						${mod.interfaces.map(inter => inter.name).join(",\n")}
					};
				`
        );
      });

      this.writeFile(
        "index.ts",
        `
				${mods.map(mod => `import * as ${mod.name} from './${mod.name}';`).join("\n")}

				(window as any).API = {
					${mods.map(mod => mod.name).join(",\n")}
				};
			`
      );
    } catch (e) {
      console.log(e.stack);
    }
  }

  /** ts 定义文件 */
  writeNamespace() {
    const mods = this.dataStructure.mods;
    const definitions = this.dataStructure.definitions;
    const template = getTemplate(this.config.templatePath, this.rootPath);

    try {
      this.writeFile(
        "api.d.ts",
        `
		declare namespace defs {
			${definitions
        .map(
          def => `
				export ${Property.toClass(def.name, def.properties)}
			`
        )
        .join("\n")}
		}

		${template.commonHeader()}

		declare namespace API {
			${mods
        .map(
          mod => `
				/**
				 * ${mod.description}
         * ${(mod.interfaces &&
           mod.interfaces.length &&
           mod.interfaces[0].samePath) ||
           ""}
				 */
				export namespace ${mod.name} {
					${mod.interfaces
            .map(
              inter => `
						/**
              * ${inter.summary}
              * ${inter.path}
							*/
						export namespace ${inter.name} {
							${template.header({
                ...inter,
                bodyParams: inter.bodyParams,
                paramsType: inter.paramsType,
                responseType: inter.responseType,
                description: inter.summary
              })}
						}
					`
            )
            .join("\n\n")}
				}
			`
        )
        .join("\n\n")}
		}
		`
      );
    } catch (e) {
      console.log(e.stack);
    }
  }

  /** swagger 中的基础类 */
  writeDefinetions() {
    const indexPath = this.getPath("index.ts");

    // 清空文件
    clearPath(this.getPath("definitions"));

    this.dataStructure.definitions.forEach(def => {
      const { properties, name } = def;
      const deps = _.uniq(
        _.compact(_.map(properties, property => property.dep))
      ).filter(dep => {
        return dep !== name;
      });

      try {
        const code = `
					${deps
            .map(dep => {
              return `import ${dep} from './${dep}';`;
            })
            .join("\n")}

					export default ${Property.toValueClass(name, properties, false)};
				`;

        this.writeFile(`definitions/${name}.ts`, code);
      } catch (e) {
        debug.error(e.stack);
      }
    });

    const names = this.dataStructure.definitions.map(def => def.name);

    const indexCode = `
      ${names
        .map(name => {
          return `import ${name} from './${name}';`;
        })
        .join("\n")}

      export {
        ${names.join(", ")}
      };
    `;

    this.writeFile("definitions/index.ts", indexCode);
  }
}

export { diff, Template };

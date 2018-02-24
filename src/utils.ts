import fetch from "node-fetch";
import * as path from "path";
import * as fs from "fs-extra";
import * as prettier from "prettier";
import * as _ from "lodash";
const PROJECT_ROOT = process.cwd();
import { Definition, DiffType, Mod, Template } from "./define";
import * as ts from "typescript";

export class Config {
  originUrl = "";
  outDir = "service";
  templatePath = "serviceTemplate";
  prettierConfig: object;
  lockPath = "swag.lock";
}

function wait(timeout = 100) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}

export async function format(fileContent: string, prettierOpts) {
  try {
    await wait(Math.random() * 100);
    return prettier.format(fileContent, {
      parser: "typescript",
      trailingComma: "all",
      singleQuote: true,
      ...prettierOpts
    });
  } catch (e) {
    console.log("prettier format 错误", fileContent, e);
    return format(fileContent, prettierOpts);
  }
}

export function clearPath(path: string) {
  if (fs.existsSync(path)) {
    fs.removeSync(path);
  }

  fs.mkdir(path);
}

export function toUpperFirstLetter(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function getMaxSamePath(paths: string[], samePath = "") {
  if (!paths.length) {
    return samePath;
  }

  if (paths.some(path => !path.includes("/"))) {
    return samePath;
  }

  const segs = paths.map(path => {
    const [firstSeg, ...restSegs] = path.split("/");
    return { firstSeg, restSegs };
  });

  if (
    segs.every(
      (seg, index) => index === 0 || seg.firstSeg === segs[index - 1].firstSeg
    )
  ) {
    return getMaxSamePath(
      segs.map(seg => seg.restSegs.join("/")),
      samePath + "/" + segs[0].firstSeg
    );
  }

  return samePath;
}

export function getIdentifierFromUrl(
  url: string,
  requestType: string,
  samePath = ""
) {
  const currUrl = url.slice(samePath.length);

  return (
    requestType +
    currUrl
      .split("/")
      .map(str => {
        if (str.match(/^{.+}$/gim)) {
          return "By" + toUpperFirstLetter(str.slice(1, str.length - 1));
        }
        return toUpperFirstLetter(str);
      })
      .join("")
  );
}

/** some reversed keyword in js but not in java */
const TS_KEYWORDS = ["delete"];
const REPLACE_WORDS = ["remove"];

export function getIdentifierFromOperatorId(operationId: string) {
  const identifier = operationId.replace(/(.+)(Using.+)/, "$1");

  const index = TS_KEYWORDS.indexOf(identifier);

  if (index === -1) {
    return identifier;
  }

  return REPLACE_WORDS[index];
}

export function getTemplate(templatePath, rootPath?: string): Template {
  const root = rootPath || PROJECT_ROOT;
  const TEMPLATE_PATH = path.join(root, templatePath);

  const tsResult = fs.readFileSync(TEMPLATE_PATH + ".ts", "utf8");
  const jsResult = ts.transpileModule(tsResult, {});

  fs.writeFileSync(TEMPLATE_PATH + ".js", jsResult.outputText, "utf8");

  return require(TEMPLATE_PATH);
  // const serviceTemp = fs.readFileSync(TEMPLATE_PATH, "utf8");
}

export function getConfig(config?: any): Config {
  const defaultConfig = new Config();

  if (config) {
    return { ...defaultConfig, ...config };
  } else {
    const root = PROJECT_ROOT;

    if (fs.existsSync(`${root}/swag-config.json`)) {
      const deerConfig = require(`${root}/swag-config.json`);

      return { ...defaultConfig, ...deerConfig };
    }

    return defaultConfig;
  }
}

export function getModelByRef($ref: string) {
  const size = "#/definitions/".length;
  const modalName = $ref.slice(size);

  if (modalName.startsWith("ResultDTO")) {
    return "defs." + modalName.slice("ResultDTO«".length, modalName.length - 1);
  }

  if (modalName.includes("«")) {
    return "defs." + modalName.slice(0, modalName.indexOf("«"));
  }

  return "defs." + modalName;
  // return 'c' + String(Math.random()).slice(2, 5);
}

export function getIndirectDefs(def: Definition) {
  const queue = [...def.infs];
  const defs = [] as Definition[];

  while (queue.length) {
    const firstDef = queue.shift();
    defs.push(firstDef);

    const more = _.differenceBy(firstDef.infs, defs);
    queue.push(...more);
  }
  return defs;
}

export function setDefinitionInfs(defs: Definition[], mods: Mod[]) {
  defs.forEach(def => {
    def.infs = [];
    def.modInfs = [];
    def.indirectInfs = [];
    def.indirectModInfs = [];
  });

  // 基类直接影响了哪些基类，形成有向图
  defs.forEach(def => {
    const deps = _.compact(def.properties.map(prop => prop.dep));

    deps.forEach(dep => {
      const depDef = defs.find(def => def.name === dep);

      depDef.infs.push(def);
    });
  });

  // 邻接表转换成邻接矩阵。（计算间接影响的基类）
  defs.forEach(def => {
    def.indirectInfs = getIndirectDefs(def);
  });

  // 基类直接影响了哪些模块
  mods.forEach(mod => {
    const deps = _.compact(mod.interfaces.map(inter => inter.def)).map(dep =>
      dep.slice(5)
    );

    deps.forEach(dep => {
      const depDef = defs.find(def => def.name === dep);

      depDef.modInfs.push(mod);
    });
  });

  // 基类间接影响了哪些模块
  defs.forEach(def => {
    def.indirectModInfs = _.unionBy(
      _.flatten(def.indirectInfs.map(inf => inf.modInfs)),
      "name"
    );
  });
}

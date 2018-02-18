import * as program from "commander";
import * as path from "path";
import * as fs from "fs-extra";
import * as debugLog from "./debugLog";
import { Cmd } from "./core";
import * as prettier from "prettier";

const packageFilePath = path.join(__dirname, "..", "package.json");
const packageInfo = JSON.parse(fs.readFileSync(packageFilePath, "utf8"));

const currentVersion = packageInfo.version;

program.version(currentVersion).usage("[命令] [配置项]");

program
  .description("swagger2ts")
  .option("-m --mod <string>", "模块名", "")
  .option("-u --url <string>", "url", "");

program.parse(process.argv);

const { mod, url } = program;

try {
  const cmd = new Cmd();

  cmd.ready().then(() => {
    cmd.write();
    cmd.save();
  });
} catch (e) {
  debugLog.error(e.toString());
}

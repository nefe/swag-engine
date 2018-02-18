# swag-engine

swagger2ts transfer Swagger docs to a controller, which help you write your owner API code and definetion

## usage

### use in code

```typescript
import { Cmd } from 'swag-engine';

const cmd = new Cmd(rootPath?, customConfig?);

(async function() {
  // sync remote docs data
  await cmd.ready();

  // get docs update information
  const { boDiffs, modDiffs } = cmd.diff();

  // boDiffs.details: string[] modDiffs.details: string[]

  // update docs information
  cmd.updateMod(mod);
  cmd.updateBo(bo);
  cmd.updateAll();

  // write API code with docs information
  cmd.write();

  // data persistence to swag.lock like yarn.lock
  cmd.save();

  // reget new docs information
  await cmd.syncNew();
}())
```

### use as cmd

#### config

* originUrl(string)

swagger api url

* outDir(string)

auto generate code file path

* templatePath(string)

your custom template path

* prettierConfig(object)

generated code is formatted by prettier, your can config your prettier style here;

* lockPath(string)

lock file path, swag-engine lock the current code version use a lockFile

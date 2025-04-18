# @liskhq/lisk-framework-report-misbehavior-plugin

@liskhq/lisk-framework-report-misbehavior-plugin is a plugin for lisk-framework that provides automatic detection of validator misbehavior and sends a reportValidatorMisbehaviorTransaction to the running node.

## Installation

```sh
$ npm install --save @liskhq/lisk-framework-report-misbehavior-plugin
```

## Config Options

```
{
	encryptedPassphrase?: string,
	defaultPassword?: string,
	dataPath: string,
	cleanupFrequency?: number,
}
```

## License

Copyright 2016-2020 Lisk Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

[lisk core github]: https://github.com/LiskHQ/lisk
[lisk documentation site]: https://lisk.com/documentation/lisk-sdk/references/lisk-framework/report-misbehavior-plugin.html

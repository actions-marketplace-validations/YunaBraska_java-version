//https://github.com/actions/toolkit/tree/main/packages/
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

try {
    let workDir = core.getInput('work-dir');
    let deep = parseInt(core.getInput('deep'));
    if (!workDir || workDir === ".") {
        workDir = getWorkingDirectory()
    }
    console.log('deep [' + (!deep ? 1 : deep) + ']');
    console.log(`work-dir [${workDir}]`);
    let result = readGradle(workDir, !deep ? 1 : deep);
    //TODO: !gradle['is_gradle'] readMaven
    console.log(JSON.stringify(result, null, 4))

    for (const [key, value] of Object.entries(result)) {
        core.setOutput(key, value);
    }
} catch (error) {
    core.setFailed(error.message);
}

function readGradle(workDir, deep) {
    let result = {}
    let gradleFiles = listFiles(workDir, deep, 'build\.gradle.*');
    //TODO: auto update this numbers
    let gradleLTS = '7.5.1';
    let javaLTS = 17;
    result['java_version'] = null;
    result['has_wrapper'] = false;
    result['builder_version'] = null;
    result['is_gradle'] = gradleFiles.length > 0;
    result['is_gradle'] = false
    gradleFiles.forEach(file => {
            try {
                let dir = path.dirname(file);
                let wrapperMapFile = path.join(dir, 'gradle', 'wrapper', 'gradle-wrapper.properties');

                let javaVersion = readJavaVersionGradle(file);
                if (javaVersion && (!result['java_version'] || result['java_version'] < javaVersion)) {
                    result['java_version'] = javaVersion;
                }

                if (fs.existsSync(path.join(dir, 'gradle.bat')) || fs.existsSync(path.join(dir, 'gradlew')) || fs.existsSync(wrapperMapFile)) {
                    result['has_wrapper'] = true;
                }

                if (fs.existsSync(wrapperMapFile)) {
                    result['builder_version'] = readBuilderVersionGradle(wrapperMapFile, result['builder_version']);
                }
            } catch (err) {
                console.error(err);
            }
        }
    )
    result['java_version'] = result['java_version'] ? result['java_version'] : javaLTS;
    result['cmd'] = result['has_wrapper'] ? (process.platform === "win32" ? 'gradle.bat' : './gradlew') : 'gradle'
    result['cmd_test'] = result['cmd'] + ' clean test'
    result['cmd_build'] = result['cmd'] + ' clean build -x test'
    result['cmd_test_build'] = result['cmd'] + ' clean build'
    result['cmd_update_deps'] = result['cmd'] + ' check'
    result['cmd_update_plugs'] = result['cmd'] + ' check'
    result['cmd_update_props'] = result['cmd'] + ' check'
    result['cmd_update_parent'] = result['cmd'] + ' check'
    result['cmd_update_wrapper'] = result['cmd'] + ' wrapper --gradle-version ' + gradleLTS
    return result;
}

function readBuilderVersionGradle(wrapperMapFile, fallback) {
    if (fs.existsSync(wrapperMapFile)) {
        let wrapperMap = readPropertiesGradle(wrapperMapFile);
        let distributionUrl = wrapperMap['distributionUrl']
        let builderVersion = distributionUrl ? new RegExp('(\\d[\._]?)+').exec(distributionUrl) : null;
        return builderVersion ? builderVersion[0] : fallback;
    }
}

function javaVersionOf(string) {
    if (string) {
        string = string.includes("_") ? string.substring(string.indexOf("_") + 1) : string;
        string = string.includes(".") ? string.substring(string.indexOf(".") + 1) : string;
        return parseInt(string.trim());
    }
    return null;
}

function readJavaVersionGradle(file) {
    let properties = readPropertiesGradle(file);
    let value = properties['sourceCompatibility'] || properties['targetCompatibility']
    return value ? javaVersionOf(properties[value] || value) : null;
}

function readPropertiesGradle(file) {
    let result = {}
    fs.readFileSync(file, {encoding: 'utf-8'}).split(/\r?\n/).forEach(line => {
        let eq = line.indexOf('=');
        if (eq > 0) {
            let key = line.substring(0, eq).trim()
            let spaceIndex = key.lastIndexOf(' ');
            result[spaceIndex > 0 ? key.substring(spaceIndex + 1).trim() : key] = line.substring(eq + 1).trim().replaceAll(/['"]+/g, '')
        } else if (!result['sourceCompatibility'] && !result['targetCompatibility'] && line.includes('languageVersion.set')) {
            result['targetCompatibility'] = line
                .replaceAll('JavaLanguageVersion', '')
                .replaceAll('languageVersion.set', '')
                .replaceAll('.of', '').trim()
                .replaceAll(/[()]+/g, '')
                .replaceAll(/['"]+/g, '')
        }
    })
    return result;
}

function listFiles(dir, deep, filter, resultList, deep_current) {
    deep = deep || -1
    deep_current = deep_current || 0
    resultList = resultList || []
    if (deep > -1 && deep_current > deep) {
        return resultList;
    }
    const files = fs.readdirSync(dir, {withFileTypes: true});
    for (const file of files) {
        if (file.isDirectory()) {
            listFiles(path.join(dir, file.name), deep, filter, resultList, deep_current++);
        } else if (!filter || new RegExp(filter).test(file.name)) {
            resultList.push(path.join(dir, file.name));
        }
    }
    return resultList;
}


function getWorkingDirectory() {
    let _a;
    return (_a = process.env['GITHUB_WORKSPACE']) !== null && _a !== void 0 ? _a : process.cwd();
}

module.exports = readGradle;

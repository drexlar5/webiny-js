"use strict";

const chalk = require("chalk");
const commander = require("commander");
const dns = require("dns");
const envinfo = require("envinfo");
const execSync = require("child_process").execSync;
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const semver = require("semver");
const spawn = require("cross-spawn");
const url = require("url");
const validateProjectName = require("validate-npm-package-name");

const packageJson = require("./package.json");

let projectName;

const program = new commander.Command(packageJson.name)
    .version(packageJson.version)
    .arguments("<project-directory>")
    .usage(`${chalk.green("<project-directory>")} [options]`)
    .action(name => {
        projectName = name;
    })
    .option("--verbose", "print additional logs")
    .option("--info", "print environment debug info")
    .option(
        "--scripts-version <alternative-package>",
        "use a non-standard version of react-scripts"
    )
    .option("--template <path-to-template>", "specify a template for the created project")
    .allowUnknownOption()
    .on("--help", () => {
        console.log(`    Only ${chalk.green("<project-directory>")} is required.`);
        console.log();
        console.log(`    A custom ${chalk.cyan("--scripts-version")} can be one of:`);
        console.log(`      - a specific npm version: ${chalk.green("0.8.2")}`);
        console.log(`      - a specific npm tag: ${chalk.green("@next")}`);
        console.log();
        console.log(`    A custom ${chalk.cyan("--template")} can be one of:`);
        console.log(`      - a custom fork published on npm: ${chalk.green("cwp-template")}`);
        console.log(
            `      - a local path relative to the current working directory: ${chalk.green(
                "file:../my-custom-template"
            )}`
        );
        console.log(
            `      - a .tgz archive: ${chalk.green(
                "https://mysite.com/my-custom-template-0.8.2.tgz"
            )}`
        );
        console.log(
            `      - a .tar.gz archive: ${chalk.green(
                "https://mysite.com/my-custom-template-0.8.2.tar.gz"
            )}`
        );
        console.log();
        console.log(`    If you have any problems, do not hesitate to file an issue:`);
        console.log(`      ${chalk.cyan("https://github.com/webiny/webiny-js/issues/new")}`);
        console.log();
    })
    .parse(process.argv);

if (program.info) {
    console.log(chalk.bold("\nEnvironment Info:"));
    console.log(`\n  current version of ${packageJson.name}: ${packageJson.version}`);
    console.log(`  running from ${__dirname}`);
    return envinfo
        .run(
            {
                System: ["OS", "CPU"],
                Binaries: ["Node", "Yarn"],
                Browsers: ["Chrome", "Edge", "Internet Explorer", "Firefox", "Safari"],
                npmPackages: ["react", "react-dom", "react-scripts"],
                npmGlobalPackages: ["create-webiny-project"]
            },
            {
                duplicates: true,
                showNotFound: true
            }
        )
        .then(console.log);
}

if (typeof projectName === "undefined") {
    console.error("Please specify the project directory:");
    console.log(`  ${chalk.cyan(program.name())} ${chalk.green("<project-directory>")}`);
    console.log();
    console.log("For example:");
    console.log(`  ${chalk.cyan(program.name())} ${chalk.green("my-webiny-project")}`);
    console.log();
    console.log(`Run ${chalk.cyan(`${program.name()} --help`)} to see all options.`);
    process.exit(1);
}

createApp(projectName, program.verbose, program.scriptsVersion, program.template);

function createApp(name, verbose, version, template) {
    const unsupportedNodeVersion = !semver.satisfies(process.version, ">=8.10.0");

    // if (unsupportedNodeVersion) {
    //   console.log(
    //     chalk.yellow(
    //       `You are using Node ${process.version} so the project will be bootstrapped with an old unsupported version of tools.\n\n` +
    //         `Please update to Node 8.10 or higher for a better, fully supported experience.\n`
    //     )
    //   );
    //   // Fall back to latest supported react-scripts on Node 4
    //   version = 'react-scripts@0.9.x';
    // }

    const root = path.resolve(name);
    const appName = path.basename(root);

    checkAppName(appName);
    fs.ensureDirSync(name);
    // if (!isSafeToCreateProjectIn(root, name)) {
    //   process.exit(1);
    // }
    console.log();

    console.log(`Creating a new Weniny project in ${chalk.green(root)}.`);
    console.log();

    const packageJson = {
        name: appName,
        version: "0.1.0",
        private: true
    };

    // const webinyConfig = module.exports = {
    //   projectName: appName
    // };

    fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify(packageJson, null, 2) + os.EOL
    );

    // fs.writeFileSync(
    //   path.join(root, 'webiny.config.js'),
    //   JSON.parse(webinyConfig, null, 2) + os.EOL
    // );

    const useYarn = shouldUseYarn();
    const originalDirectory = process.cwd();
    process.chdir(root);
    if (!useYarn) {
        process.exit(1);
    }

    if (useYarn) {
        let yarnUsesDefaultRegistry = true;
        try {
            yarnUsesDefaultRegistry =
                execSync("yarnpkg config get registry")
                    .toString()
                    .trim() === "https://registry.yarnpkg.com";
        } catch (e) {
            // ignore
        }
        if (yarnUsesDefaultRegistry) {
            fs.copySync(require.resolve("./yarn.lock.cached"), path.join(root, "yarn.lock"));
        }
    }

    run(root, appName, version, verbose, originalDirectory, template, useYarn);
}

function shouldUseYarn() {
    try {
        execSync("yarnpkg --version", { stdio: "ignore" });
        return true;
    } catch (e) {
        return false;
    }
}

function install(root, useYarn, dependencies, verbose, isOnline) {
    return new Promise((resolve, reject) => {
        let command;
        let args;
        if (useYarn) {
            command = "yarnpkg";
            args = ["add", "--exact"];
            if (!isOnline) {
                args.push("--offline");
            }
            [].push.apply(args, dependencies);

            args.push(root);

            if (!isOnline) {
                console.log(chalk.yellow("You appear to be offline."));
                console.log(chalk.yellow("Falling back to the local Yarn cache."));
                console.log();
            }
        }

        if (verbose) {
            args.push("--verbose");
        }

        const child = spawn(command, args, { stdio: "inherit" });
        child.on("close", code => {
            if (code !== 0) {
                reject({
                    command: `${command} ${args.join(" ")}`
                });
                return;
            }
            resolve();
        });
    });
}

function run(root, appName, version, verbose, originalDirectory, template, useYarn) {
    Promise.all([
        getInstallPackage(version, originalDirectory),
        getTemplateInstallPackage(template, originalDirectory)
    ]).then(([packageToInstall, templateToInstall]) => {
        const allDependencies = ["react", "react-dom", packageToInstall];

        console.log("Installing packages. This might take a couple of minutes.");

        Promise.all([getPackageInfo(packageToInstall), getPackageInfo(templateToInstall)])
            .then(([packageInfo, templateInfo]) =>
                checkIfOnline(useYarn).then(isOnline => ({
                    isOnline,
                    packageInfo,
                    templateInfo
                }))
            )
            .then(({ isOnline, packageInfo, templateInfo }) => {
                let packageVersion = semver.coerce(packageInfo.version);

                const templatesVersionMinimum = "3.3.0";

                // Assume compatibility if we can't test the version.
                if (!semver.valid(packageVersion)) {
                    packageVersion = templatesVersionMinimum;
                }

                // Only support templates when used alongside new react-scripts versions.
                const supportsTemplates = semver.gte(packageVersion, templatesVersionMinimum);
                if (supportsTemplates) {
                    allDependencies.push(templateToInstall);
                } else if (template) {
                    console.log("");
                    console.log(
                        `The ${chalk.cyan(packageInfo.name)} version you're using ${
                            packageInfo.name === "react-scripts" ? "is not" : "may not be"
                        } compatible with the ${chalk.cyan("--template")} option.`
                    );
                    console.log("");
                }

                console.log(
                    `Installing ${chalk.cyan("react")}, ${chalk.cyan(
                        "react-dom"
                    )}, and ${chalk.cyan(packageInfo.name)}${
                        supportsTemplates ? ` with ${chalk.cyan(templateInfo.name)}` : ""
                    } ...`
                );
                console.log();

                return install(root, useYarn, allDependencies, verbose, isOnline).then(() => ({
                    packageInfo,
                    supportsTemplates,
                    templateInfo
                }));
            })
            .then(async ({ packageInfo, supportsTemplates, templateInfo }) => {
                const packageName = packageInfo.name;
                const templateName = supportsTemplates ? templateInfo.name : undefined;
                checkNodeVersion(packageName);
                setCaretRangeForRuntimeDeps(packageName);

                // --- executes installer
                require(`${templateName}`)({ name: appName });

            })
            .catch(reason => {
                console.log();
                console.log("Aborting installation.");
                if (reason.command) {
                    console.log(`  ${chalk.cyan(reason.command)} has failed.`);
                } else {
                    console.log(chalk.red("Unexpected error. Please report it as a bug:"));
                    console.log(reason);
                }
                console.log();

                // On 'exit' we will delete these files from target directory.
                const knownGeneratedFiles = ["package.json", "yarn.lock", "node_modules"];
                const currentFiles = fs.readdirSync(path.join(root));
                currentFiles.forEach(file => {
                    knownGeneratedFiles.forEach(fileToMatch => {
                        // This removes all knownGeneratedFiles.
                        if (file === fileToMatch) {
                            console.log(`Deleting generated file... ${chalk.cyan(file)}`);
                            fs.removeSync(path.join(root, file));
                        }
                    });
                });
                const remainingFiles = fs.readdirSync(path.join(root));
                if (!remainingFiles.length) {
                    // Delete target folder if empty
                    console.log(
                        `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
                            path.resolve(root, "..")
                        )}`
                    );
                    process.chdir(path.resolve(root, ".."));
                    fs.removeSync(path.join(root));
                }
                console.log("Done.");
                process.exit(1);
            });
    });
}

function getInstallPackage(version, originalDirectory) {
    let packageToInstall = "@webiny/cli";
    const validSemver = semver.valid(version);
    if (validSemver) {
        packageToInstall += `@${validSemver}`;
    } else if (version) {
        if (version[0] === "@" && !version.includes("/")) {
            packageToInstall += version;
        } else if (version.match(/^file:/)) {
            packageToInstall = `file:${path.resolve(
                originalDirectory,
                version.match(/^file:(.*)?$/)[1]
            )}`;
        } else {
            // for tar.gz or alternative paths
            packageToInstall = version;
        }
    }

    return Promise.resolve(packageToInstall);
}

function getTemplateInstallPackage(template, originalDirectory) {
    let templateToInstall = "cwp-template";
    if (template) {
        if (template.match(/^file:/)) {
            templateToInstall = `file:${path.resolve(
                originalDirectory,
                template.match(/^file:(.*)?$/)[1]
            )}`;
        } else if (template.includes("://") || template.match(/^.+\.(tgz|tar\.gz)$/)) {
            // for tar.gz or alternative paths
            templateToInstall = template;
        } else {
            // Add prefix 'cwp-template-' to non-prefixed templates, leaving any
            // @scope/ intact.
            const packageMatch = template.match(/^(@[^/]+\/)?(.+)$/);
            const scope = packageMatch[1] || "";
            const templateName = packageMatch[2];

            if (
                templateName === templateToInstall ||
                templateName.startsWith(`${templateToInstall}-`)
            ) {
                // Covers:
                // - cwp-template
                // - @SCOPE/cwp-template
                // - cwp-template-NAME
                // - @SCOPE/cwp-template-NAME
                templateToInstall = `${scope}${templateName}`;
            } else if (templateName.startsWith("@")) {
                // Covers using @SCOPE only
                templateToInstall = `${templateName}/${templateToInstall}`;
            } else {
                // Covers templates without the `cwp-template` prefix:
                // - NAME
                // - @SCOPE/NAME
                templateToInstall = `${scope}${templateToInstall}-${templateName}`;
            }
        }
    }

    return Promise.resolve(templateToInstall);
}

function getPackageInfo(installPackage) {
    if (installPackage.startsWith("git+")) {
        return Promise.resolve({
            name: installPackage.match(/([^/]+)\.git(#.*)?$/)[1]
        });
    } else if (installPackage.match(/.+@/)) {
        // Do not match @scope/ when stripping off @version or @tag
        return Promise.resolve({
            name: installPackage.charAt(0) + installPackage.substr(1).split("@")[0],
            version: installPackage.split("@")[1]
        });
    } 
    return Promise.resolve({ name: installPackage });
}

function checkNodeVersion(packageName) {
    const packageJsonPath = path.resolve(
        process.cwd(),
        "node_modules",
        packageName,
        "package.json"
    );

    if (!fs.existsSync(packageJsonPath)) {
        return;
    }

    const packageJson = require(packageJsonPath);
    if (!packageJson.engines || !packageJson.engines.node) {
        return;
    }

    if (!semver.satisfies(process.version, packageJson.engines.node)) {
        console.error(
            chalk.red(
                "You are running Node %s.\n" +
                    "Create Webiny Project requires Node %s or higher. \n" +
                    "Please update your version of Node."
            ),
            process.version,
            packageJson.engines.node
        );
        process.exit(1);
    }
}

function checkAppName(appName) {
    const validationResult = validateProjectName(appName);
    if (!validationResult.validForNewPackages) {
        console.error(
            chalk.red(
                `Cannot create a project named ${chalk.green(
                    `"${appName}"`
                )} because of npm naming restrictions:\n`
            )
        );
        [...(validationResult.errors || []), ...(validationResult.warnings || [])].forEach(
            error => {
                console.error(chalk.red(`  * ${error}`));
            }
        );
        console.error(chalk.red("\nPlease choose a different project name."));
        process.exit(1);
    }

    // TODO: there should be a single place that holds the dependencies
    const dependencies = ["react", "react-dom", "react-scripts", "webiny"].sort();
    if (dependencies.includes(appName)) {
        console.error(
            chalk.red(
                `Cannot create a project named ${chalk.green(
                    `"${appName}"`
                )} because a dependency with the same name exists.\n` +
                    `Due to the way npm works, the following names are not allowed:\n\n`
            ) +
                chalk.cyan(dependencies.map(depName => `  ${depName}`).join("\n")) +
                chalk.red("\n\nPlease choose a different project name.")
        );
        process.exit(1);
    }
}

function makeCaretRange(dependencies, name) {
    const version = dependencies[name];

    if (typeof version === "undefined") {
        console.error(chalk.red(`Missing ${name} dependency in package.json`));
        process.exit(1);
    }

    let patchedVersion = `^${version}`;

    if (!semver.validRange(patchedVersion)) {
        console.error(
            `Unable to patch ${name} dependency version because version ${chalk.red(
                version
            )} will become invalid ${chalk.red(patchedVersion)}`
        );
        patchedVersion = version;
    }

    dependencies[name] = patchedVersion;
}

function setCaretRangeForRuntimeDeps(packageName) {
    const packagePath = path.join(process.cwd(), "package.json");
    const packageJson = require(packagePath);

    if (typeof packageJson.dependencies === "undefined") {
        console.error(chalk.red("Missing dependencies in package.json"));
        process.exit(1);
    }

    const packageVersion = packageJson.dependencies[packageName];
    if (typeof packageVersion === "undefined") {
        console.error(chalk.red(`Unable to find ${packageName} in package.json`));
        process.exit(1);
    }

    makeCaretRange(packageJson.dependencies, "react");
    makeCaretRange(packageJson.dependencies, "react-dom");

    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + os.EOL);
}

function getProxy() {
  if (process.env.https_proxy) {
    return process.env.https_proxy;
  } else {
    try {
      // Trying to read https-proxy from .npmrc
      let httpsProxy = execSync('npm config get https-proxy')
        .toString()
        .trim();
      return httpsProxy !== 'null' ? httpsProxy : undefined;
    } catch (e) {
      return;
    }
  }
}

function checkIfOnline(useYarn) {
    if (!useYarn) {
        // Don't ping the Yarn registry.
        // We'll just assume the best case.
        return Promise.resolve(true);
    }

    return new Promise(resolve => {
        dns.lookup("registry.yarnpkg.com", err => {
            let proxy;
            if (err != null && (proxy = getProxy())) {
                // If a proxy is defined, we likely can't resolve external hostnames.
                // Try to resolve the proxy name as an indication of a connection.
                dns.lookup(url.parse(proxy).hostname, proxyErr => {
                    resolve(proxyErr == null);
                });
            } else {
                resolve(err == null);
            }
        });
    });
}
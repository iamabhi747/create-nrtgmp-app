#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import prompts from "prompts";
import chalk from "chalk";
import { execa } from "execa";

async function cloneRepository(projectPath, templateBranch) {
  try {
    await execa("git", [
      "clone",
      `--branch=${templateBranch || "main"}`,
      "--single-branch",
      "--depth=1",
      `https://github.com/iamabhi747/nrtgmp-template`,
      projectPath,
    ]);

    await fs.remove(path.join(projectPath, ".git"));
    await execa("git", ["init"], { cwd: projectPath });

    return true;
  } catch (error) {
    console.error("Failed to get template data:", error.message);
    return false;
  }
}

async function getDatabaseConfig() {
  const questions = [
    {
      type: "confirm",
      name: "mongodb",
      message: "Do you want MongoDB?",
      initial: true,
    },
    {
      type: "confirm",
      name: "sequelize",
      message: "Do you want Sequelize?",
      initial: true,
    },
    {
      type: prev => prev && "select",
      name: "sequelizeDialect",
      message: "Select Dialect of Sequelize:",
      choices: [
        { title: "PostgreSQL", value: "postgres" },
        { title: "MySQL", value: "mysql" },
        { title: "MariaDB", value: "mariadb" },
        { title: "SQLite", value: "sqlite" },
        { title: "Microsoft SQL Server", value: "mssql" },
      ],
      initial: 0,
      skip: (prev, values) => !values.sequelize, // Skip if Sequelize is not selected
    },
  ];

  return await prompts(questions, {
    onCancel: () => {
      process.exit(1);
    },
  });
}

async function updateProjectConfig(projectPath, dbConfig) {
  const packageJsonPath = path.join(projectPath, "package.json");
  const packageJson = await fs.readJson(packageJsonPath);

  // Update project name from directory name
  packageJson.name = path.basename(projectPath);

  // Create .env file
  const envPath = path.join(projectPath, ".env");
  let envContent = `
# MongoDB Configuration
MONGODB_URI=mongodb://<-add-your-mongodb-uri->

# Sequelize Configuration
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="nrtgmp"
DB_USER="postgres"
DB_PASS=""

SEQUELIZE_PREFIX="pg"

# Iron Session
SESSION_COOKIE_NAME="NSESSION"
SESSION_SECRET="${[...Array(40)].map(() => Math.random().toString(36)[2]).join('')}"
  `;

  // Save updated package.json
  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

  // Save .env file
  await fs.writeFile(envPath, envContent.trim());
}

async function promptToUseDefaultTemplate() {
  const questions = [
    {
      type: "confirm",
      name: "useDefaultTemplate",
      message: "Do you want to use default template?",
      initial: true,
    },
  ];

  const ans = await prompts(questions, {
    onCancel: () => {
      process.exit(1);
    },
  });

  if (!ans.useDefaultTemplate) {
    process.exit(1);
  }
}

async function getTempleteBranch(dbConfig) {
  if (dbConfig.mongodb && dbConfig.sequelize) {
    if (dbConfig.sequelizeDialect === "postgres") {
      return "main";
    } else {
      console.log(chalk.yellow("Sorry, currently modifications are not supported by create-nrtgmp-app. Only PostgreSQL is supported by the default template. You can change it manually after the project is created."));
      await promptToUseDefaultTemplate();
    }
  } else {
    console.log(chalk.yellow("Sorry, currently modifications are not supported by create-nrtgmp-app use default template with both MongoDB and Sequelize."));
    await promptToUseDefaultTemplate();
  }

  dbConfig.mongodb = true;
  dbConfig.sequelize = true;
  dbConfig.sequelizeDialect = "postgres";
  return "main";
}


async function setupDevelopmentEnvironment(projectPath) {
  try {
    // Install dependencies
    console.log(chalk.green("Installing dependencies..."));
    await execa("npm", ["install"], { cwd: projectPath });

    // Initial commit
    console.log(chalk.green("Creating initial commit..."));
    await execa("git", ["add", "."], { cwd: projectPath });
    await execa("git", ["commit", "-m", "Initial commit via NRTGMP"], { cwd: projectPath });
  } catch (error) {
    console.error(chalk.red("Failed to set up development environment:"), error.message);
    process.exit(1);
  }
}


async function main() {
  // Get project name from command line arguments
  const projectName = process.argv[2];

  if (!projectName) {
    console.error(chalk.red("Please specify the project name:"));
    console.log(
      chalk.green("  npx create-nrtgmp-app"),
      chalk.green("<project-name>")
    );
    process.exit(1);
  }

  const projectPath = path.resolve(process.cwd(), projectName);

  // Check if directory already exists
  if (fs.existsSync(projectPath)) {
    console.error(chalk.red(`Error: Directory ${projectName} already exists.`));
    process.exit(1);
  }

  // Get database configuration
  console.log(chalk.green("\nDatabase Configuration:"));
  const dbConfig = await getDatabaseConfig();

  const templeteBranch = await getTempleteBranch(dbConfig);

  console.log(chalk.green("Creating your project..."));

  // Clone the repository
  console.log(chalk.green("Fetching template..."));
  const success = await cloneRepository(projectPath);



  if (!success) {
    console.error(chalk.red("Failed to create project."));
    process.exit(1);
  }

  // Update project configuration
  await updateProjectConfig(projectPath, dbConfig);

  // Setup development environment
  await setupDevelopmentEnvironment(projectPath);

  // Final success message
  console.log(
    chalk.green(`
      Success! Created ${projectName} at ${projectPath}
      
      Selected options:
      ${dbConfig.mongodb ? "✓ MongoDB" : "✗ MongoDB"}
      ${
        dbConfig.sequelize
          ? `✓ Sequelize (${dbConfig.sequelizeDialect})`
          : "✗ Sequelize"
      }

      Next Steps:
      - Fill the environment variables in .env file
      
      Happy hacking!
    `)
  );
}

main().catch((error) => {
  console.error(chalk.red("Error:"), error);
  process.exit(1);
});

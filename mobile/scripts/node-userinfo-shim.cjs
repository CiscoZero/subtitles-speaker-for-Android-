const os = require("node:os");

os.userInfo = function userInfo() {
  return {
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || "user",
    homedir: os.homedir(),
    shell: process.env.ComSpec || process.env.SHELL || null,
  };
};

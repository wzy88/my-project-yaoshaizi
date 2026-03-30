# Git 工作流

这个仓库建议用“`main` 保持稳定，功能开发走分支”的方式。

## 日常流程

先切到最新 `main`：

```bash
git checkout main
git pull
```

开始一个功能时，新建分支：

```bash
git checkout -b feat/room-page
```

开发过程中，做完一小段就提交一次：

```bash
git add .
git commit -m "feat: add room page skeleton"
```

推送分支：

```bash
git push -u origin feat/room-page
```

功能确认稳定后，再合回 `main`：

```bash
git checkout main
git pull
git merge feat/room-page
git push
```

## 提交信息约定

建议优先使用下面几类前缀：

- `feat:` 新功能
- `fix:` 修复问题
- `chore:` 工程或维护项
- `docs:` 文档改动
- `refactor:` 重构但不改变功能

示例：

```bash
git commit -m "feat: add dice room join flow"
git commit -m "fix: handle websocket reconnect"
git commit -m "docs: update local setup guide"
git commit -m "chore: improve gitignore"
```

## 常用查看命令

查看当前状态：

```bash
git status
```

查看提交历史：

```bash
git log --oneline --graph --decorate
```

查看未提交改动：

```bash
git diff
```

## 安全回滚

如果某次提交已经推到远程，优先用 `git revert`，不要直接改历史：

```bash
git log --oneline
git revert <commit-id>
git push
```

这样会新增一条“撤销提交”，更安全，也更适合协作。

如果只是想临时查看旧版本，可以：

```bash
git checkout <commit-id>
```

看完后回到主分支：

```bash
git checkout main
```

## 这个仓库当前约定

- `main` 只保留相对稳定的版本
- 较大的改动优先走 `feat/*`、`fix/*` 这类分支
- 每次提交尽量只做一件事，方便回滚和定位问题

const fs = require('fs').promises;
const path = require('path');
const {Octokit} = require('@octokit/rest');
const yaml = require('js-yaml');

// 配置信息
const config = {
    owner: 'luoyuanxiang', // GitHub用户名
    repo: 'hexo-friendly-links',       // 仓库名称
    token: process.env.GH_TOKEN // GitHub个人访问令牌
};
// 创建Octokit实例
const octokit = new Octokit({
    auth: config.token
});

/**
 * 从Markdown格式文本中提取博客信息
 * @param {string} markdownText - 包含博客信息的Markdown文本
 * @returns {Object} 提取的博客信息对象
 */
function parseBlogInfo(markdownText) {
    // 定义正则表达式模式
    const sectionPattern = /###\s*(.*?)\s*\n([\s\S]*?)(?=###|$)/g;
    // 用于存储提取的信息
    const blogInfo = {};
    // 执行匹配
    let match;
    while ((match = sectionPattern.exec(markdownText)) !== null) {
        // 提取标题和内容
        const title = match[1].trim();
        let content = match[2].trim();
        // 移除内容中的多余换行符
        content = content.replace(/^\n+|\n+$/g, '');
        blogInfo[title] = content;
    }
    return blogInfo;
}

// 从Issue正文中提取友链信息
function extractFriendLinkInfo(body) {
    const data = parseBlogInfo(body);
    return {
        name: data['博客名称'],
        link: data['博客地址'],
        avatar: data['博客图标'],
        descr: data['博客描述'],
        screenshot: data['博客首页']
    };
}

// 获取所有友链申请Issue
async function getFriendLinkIssues() {
    try {
        const { data: issues } = await octokit.issues.listForRepo({
            owner: config.owner,
            repo: config.repo,
            state: 'open', // 只获取未关闭的Issue
            per_page: 100
        });
        return issues;
    } catch (error) {
        console.error('获取Issue列表失败:', error.message);
        throw error;
    }
}

// 处理单个Issue并提取友链信息
async function processIssue(issue) {
    try {
        // 提取友链信息
        const friendLink = extractFriendLinkInfo(issue.body);
        // 检查是否包含所有必要字段
        const requiredFields = ['name', 'link', 'avatar', 'descr'];
        const isValid = requiredFields.every(field => friendLink[field]);
        if (isValid) {
            return {
                ...friendLink,
                issueNumber: issue.number,
                createdAt: issue.created_at,
                updatedAt: issue.updated_at,
                state: issue.state
            };
        } else {
            console.log(`Issue #${issue.number} 缺少必要字段，已忽略`);
            return null;
        }
    } catch (error) {
        console.error(`处理Issue #${issue.number} 失败:`, error.message);
        return null;
    }
}

// 关闭Issue
async function closeIssue(issueNumber) {
    try {
        await octokit.issues.update({
            owner: config.owner,
            repo: config.repo,
            issue_number: issueNumber,
            state: 'closed'
        });
        console.log(`Issue #${issueNumber} 已关闭`);
    } catch (error) {
        console.error(`关闭Issue #${issueNumber} 失败:`, error.message);
        throw error;
    }
}

// 添加评论
async function addComment(issueNumber, comment) {
    try {
        await octokit.issues.createComment({
            owner: config.owner,
            repo: config.repo,
            issue_number: issueNumber,
            body: comment
        });
        console.log(`已在Issue #${issueNumber} 添加评论`);
    } catch (error) {
        console.error(`在Issue #${issueNumber} 添加评论失败:`, error.message);
        throw error;
    }
}

// 主函数
async function main() {
    try {
        console.log('开始获取友链申请...');
        const issues = await getFriendLinkIssues();
        console.log(`共找到 ${issues.length} 个未关闭的友链申请`);
        const friendLinks = [];
        for (const issue of issues) {
            const friendLink = await processIssue(issue);
            if (friendLink) {
                friendLinks.push(friendLink);
                // 添加成功评论并关闭Issue
                await addComment(issue.number, '感谢您的友链申请！您的信息已被添加到我的博客。');
                await closeIssue(issue.number);
            } else {
                // 添加失败评论并关闭Issue
                await addComment(issue.number, '很抱歉，您的友链申请缺少必要信息，请补全后重新提交。');
                await closeIssue(issue.number);
            }
        }
        // 保存友链信息到文件
        saveLinks(friendLinks)
        console.log(`成功提取 ${friendLinks.length} 个友链信息`);
        return friendLinks;
    } catch (error) {
        console.error('处理过程中发生错误:', error);
        process.exit(1);
    }
}

/**
 * 保存友链信息
 * @param friendLinks
 */
function saveLinks(friendLinks) {
    let fileContents
    try {
        fileContents = fs.readFile(path.join(__dirname, '../source/_data/link.yml'), 'utf8');
        fileContents.then(data => {
            let config;
            try {
                config = yaml.load(data);
                config[2].link_list.push(...friendLinks);
                const updatedYaml = yaml.dump(config);
                fs.writeFile(path.join(__dirname, '../source/_data/link.yml'), updatedYaml, 'utf8')
                    .then(() => {
                        console.log('YAML file updated successfully.');
                    })
                    .catch((error) => {
                        console.error('Error writing file:', error);
                    });
            } catch (e) {
                console.error('Error parsing YAML:', e);
            }
        })
    } catch (error) {
        console.error('Error reading file:', error);
    }
}

// 执行主函数
main().then(r => {});
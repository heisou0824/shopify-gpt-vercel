import {
  handleOptions,
  json,
  readBody,
  requireBearer
} from "../lib/http.js";

import {
  errorPayload,
  graphql
} from "../lib/shopify.js";

const clean = (value) =>
  typeof value === "string" ? value.trim() : "";

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map(clean)
      .filter(Boolean);
  }

  return [];
}

async function resolveBlogId(body) {
  const suppliedBlogId = clean(body.blogId);

  if (suppliedBlogId) {
    return suppliedBlogId;
  }

  const blogTitle = clean(body.blogTitle);

  if (!blogTitle) {
    const error = new Error("缺少blogId或blogTitle");
    error.status = 400;
    throw error;
  }

  const data = await graphql(`
    query FindBlogs {
      blogs(first: 100) {
        nodes {
          id
          title
          handle
        }
      }
    }
  `);

  const wanted = blogTitle.toLowerCase();

  const blog = data.blogs.nodes.find((item) =>
    item.title?.toLowerCase() === wanted ||
    item.handle?.toLowerCase() === wanted
  );

  if (!blog) {
    const error = new Error(`未找到博客分类：${blogTitle}`);
    error.status = 404;
    error.details = {
      requestedBlog: blogTitle,
      availableBlogs: data.blogs.nodes.map((item) => ({
        id: item.id,
        title: item.title,
        handle: item.handle
      }))
    };
    throw error;
  }

  return blog.id;
}

async function listArticles(req, res) {
  const requested = Number(req.query?.limit || 10);
  const first = Math.min(Math.max(requested || 10, 1), 50);
  const query = clean(req.query?.query);

  const data = await graphql(`
    query ListArticles(
      $first: Int!
      $query: String
    ) {
      articles(
        first: $first
        reverse: true
        query: $query
      ) {
        nodes {
          id
          title
          handle
          isPublished
          publishedAt
          createdAt
          updatedAt
          tags

          author {
            name
          }

          blog {
            id
            title
            handle
          }

          image {
            url
            altText
          }

          metafields(
            first: 10
            keys: [
              "global.title_tag"
              "global.description_tag"
            ]
          ) {
            nodes {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  `, {
    first,
    query: query || null
  });

  return json(res, 200, {
    ok: true,
    count: data.articles.nodes.length,
    articles: data.articles.nodes
  });
}

async function createDraftArticle(req, res) {
  const body = readBody(req);

  const title = clean(body.title);
  const bodyHtml = clean(body.bodyHtml);

  if (!title) {
    return json(res, 400, {
      ok: false,
      error: "缺少文章标题title"
    });
  }

  if (!bodyHtml) {
    return json(res, 400, {
      ok: false,
      error: "缺少文章正文bodyHtml"
    });
  }

  const blogId = await resolveBlogId(body);

  const article = {
    blogId,
    title,
    body: bodyHtml,

    // 安全限制：
    // 无论请求传什么值，都只能创建未发布文章。
    isPublished: false,

    author: {
      name: clean(body.authorName) || "RoveTrek"
    }
  };

  if (clean(body.handle)) {
    article.handle = clean(body.handle);
  }

  if (clean(body.summaryHtml)) {
    article.summary = clean(body.summaryHtml);
  }

  const articleTags = normalizeTags(body.tags);

  if (articleTags.length) {
    article.tags = articleTags;
  }

  if (
    body.image &&
    /^https:\/\//i.test(clean(body.image.url))
  ) {
    article.image = {
      url: clean(body.image.url)
    };

    if (clean(body.image.altText)) {
      article.image.altText = clean(body.image.altText);
    }
  }

  const metafields = [];

  if (clean(body.seoTitle)) {
    metafields.push({
      namespace: "global",
      key: "title_tag",
      type: "single_line_text_field",
      value: clean(body.seoTitle)
    });
  }

  if (clean(body.seoDescription)) {
    metafields.push({
      namespace: "global",
      key: "description_tag",
      type: "single_line_text_field",
      value: clean(body.seoDescription)
    });
  }

  if (metafields.length) {
    article.metafields = metafields;
  }

  const data = await graphql(`
    mutation CreateDraftArticle(
      $article: ArticleCreateInput!
    ) {
      articleCreate(article: $article) {
        article {
          id
          title
          handle
          body
          summary
          tags
          isPublished
          publishedAt

          author {
            name
          }

          blog {
            id
            title
            handle
          }

          image {
            url
            altText
          }

          metafields(
            first: 10
            keys: [
              "global.title_tag"
              "global.description_tag"
            ]
          ) {
            nodes {
              id
              namespace
              key
              value
              type
            }
          }
        }

        userErrors {
          code
          field
          message
        }
      }
    }
  `, {
    article
  });

  const result = data.articleCreate;

  if (result.userErrors?.length) {
    return json(res, 400, {
      ok: false,
      error: "Shopify拒绝创建博客文章",
      details: result.userErrors
    });
  }

  return json(res, 201, {
    ok: true,
    message: "博客文章已创建为未发布草稿。",
    article: result.article,

    safety: {
      forcedPublished: false,
      isPublished: false
    }
  });
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (!requireBearer(req, res)) return;

  try {
    if (req.method === "GET") {
      return await listArticles(req, res);
    }

    if (req.method === "POST") {
      return await createDraftArticle(req, res);
    }

    return json(res, 405, {
      ok: false,
      error: "只支持GET或POST"
    });

  } catch (error) {
    return json(
      res,
      error.status || 500,
      errorPayload(error)
    );
  }
}

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  'https://vazaagmczfpeheachute.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhemFhZ21jemZwZWhlYWNodXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDc1MzEsImV4cCI6MjA4ODM4MzUzMX0.8PzXaTVWNMDLkcAldBkqGIzEqKMBKR3E8e0qDn2VMkQ'
)

const BASE_URL = 'https://vault-50.co'

async function generateSitemap() {
  // Fetch published blogs
  const { data: blogs } = await supabase
    .from('blogs')
    .select('slug, updated_at, title, excerpt, category')
    .eq('published', true)

  // Fetch published series and their parts
  const { data: series } = await supabase
    .from('series')
    .select('slug, title, subtitle, description, series_parts(slug, title, subtitle, part_number)')
    .eq('is_published', true)

  // Fetch all movies with extra data for llms-full.txt
  const { data: movies } = await supabase
    .from('movies')
    .select('id, title, original_title, release_year, original_language, updated_at')
    .order('release_year', { ascending: true })

  // ── Generate sitemap.xml ──────────────────────────────────

  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/browse', priority: '0.9', changefreq: 'weekly' },
    { url: '/blog', priority: '0.9', changefreq: 'weekly' },
    { url: '/threads', priority: '0.9', changefreq: 'weekly' },
  ]

  const blogUrls = (blogs || []).map(b => ({
    url: `/blog/${b.slug}`,
    priority: '0.8',
    changefreq: 'monthly',
    lastmod: b.updated_at?.split('T')[0]
  }))

  const threadUrls = (series || []).flatMap(s => [
    { url: `/threads/${s.slug}`, priority: '0.9', changefreq: 'monthly' },
    ...(s.series_parts || []).map(p => ({
      url: `/threads/${s.slug}/${p.slug}`,
      priority: '0.8',
      changefreq: 'monthly'
    }))
  ])

  const movieUrls = (movies || []).map(m => ({
    url: `/movie/${m.id}`,
    priority: '0.6',
    changefreq: 'monthly',
    lastmod: m.updated_at?.split('T')[0]
  }))

  const allUrls = [...staticPages, ...blogUrls, ...threadUrls, ...movieUrls]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${BASE_URL}${u.url}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`

  writeFileSync('./public/sitemap.xml', xml)
  console.log(`✅ Sitemap generated with ${allUrls.length} URLs`)

  // ── Generate llms-full.txt ────────────────────────────────

  const movieCount = (movies || []).length
  const decades = {}
  const languages = {}

  for (const m of (movies || [])) {
    const decade = m.release_year ? `${Math.floor(m.release_year / 10) * 10}s` : 'Unknown'
    decades[decade] = (decades[decade] || 0) + 1
    const lang = m.original_language || 'unknown'
    languages[lang] = (languages[lang] || 0) + 1
  }

  const sortedDecades = Object.entries(decades).sort((a, b) => a[0].localeCompare(b[0]))
  const topLanguages = Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 20)

  let llmsFull = `# VaultOf50 — Full Site Index

> Horror film archive covering 1950–2000. ${movieCount.toLocaleString()} films archived across every country and decade.

Generated: ${new Date().toISOString().split('T')[0]}

## Stats

- Total films: ${movieCount.toLocaleString()}
- Coverage: 1950–2000
- Countries: 50+
- Languages: ${Object.keys(languages).length}

## Films by Decade

${sortedDecades.map(([decade, count]) => `- ${decade}: ${count} films`).join('\n')}

## Top Languages

${topLanguages.map(([lang, count]) => `- ${lang}: ${count} films`).join('\n')}

## Blog Posts

${(blogs || []).map(b => `- [${b.title}](${BASE_URL}/blog/${b.slug})${b.excerpt ? `: ${b.excerpt.slice(0, 100)}` : ''}`).join('\n')}

## Thread Series

${(series || []).map(s => {
  const parts = (s.series_parts || [])
    .sort((a, b) => a.part_number - b.part_number)
    .map(p => `  - Part ${p.part_number}: [${p.title}](${BASE_URL}/threads/${s.slug}/${p.slug})${p.subtitle ? ` — ${p.subtitle}` : ''}`)
    .join('\n')
  return `### ${s.title}\n\n${s.description || s.subtitle || ''}\n\n${parts}`
}).join('\n\n')}

## Film Index

Each line: ID | Title | Year | Language | URL

\`\`\`
${(movies || []).map(m => `${m.id} | ${m.title}${m.original_title && m.original_title !== m.title ? ` (${m.original_title})` : ''} | ${m.release_year || '?'} | ${m.original_language || '?'} | ${BASE_URL}/movie/${m.id}`).join('\n')}
\`\`\`
`

  writeFileSync('./public/llms-full.txt', llmsFull)
  console.log(`✅ llms-full.txt generated with ${movieCount.toLocaleString()} films`)
}

generateSitemap()

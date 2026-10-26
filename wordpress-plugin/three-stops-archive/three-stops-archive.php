<?php
/**
 * Plugin Name: 3 Stops from Main Archive
 * Description: Shows past issues of the "3 Stops from Main" newsletter (fetched from Pando) as a list under the signup form on /newsletter, with one page per issue at /newsletter/vol-001-title. Shows nothing until the first issue has been sent.
 * Version: 1.2.2
 * Author: Dan Benson
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

// Where Pando lives. Override in wp-config.php with define('TSM_PANDO_URL', '...') if it ever moves.
if (!defined('TSM_PANDO_URL')) {
    define('TSM_PANDO_URL', 'https://pando.danbenson.me');
}
// The slug of the WordPress page that holds the intro + signup form.
if (!defined('TSM_PAGE_SLUG')) {
    define('TSM_PAGE_SLUG', 'newsletter');
}
// How long a fetched copy of the feed is reused before asking Pando again.
if (!defined('TSM_CACHE_SECONDS')) {
    define('TSM_CACHE_SECONDS', 300);
}
// Fake post ID used for the virtual issue page (negative so it can never collide with a real post).
if (!defined('TSM_FAKE_POST_ID')) {
    define('TSM_FAKE_POST_ID', -9301);
}

/* -------------------------------------------------------------------------
 * Talking to Pando (cached; falls back to the last good copy if Pando is down)
 * ---------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * Draft preview: with the key from Pando → Settings → "Archive preview key" saved under
 * Settings → 3 Stops Archive, logged-in editors also see draft issues (marked "Draft").
 * Visitors never do: preview fetches skip every cache, so drafts can't leak into the
 * public copy.
 * ---------------------------------------------------------------------- */

function tsm_preview_mode()
{
    return is_user_logged_in() && current_user_can('edit_pages') && get_option('tsm_preview_key', '') !== '';
}

add_action('admin_menu', function () {
    add_options_page('3 Stops Archive', '3 Stops Archive', 'manage_options', 'tsm-archive', function () {
        ?>
        <div class="wrap">
            <h1>3 Stops Archive</h1>
            <form method="post" action="options.php">
                <?php settings_fields('tsm_archive'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="tsm_preview_key">Preview key</label></th>
                        <td>
                            <input name="tsm_preview_key" id="tsm_preview_key" type="text" class="regular-text code"
                                value="<?php echo esc_attr(get_option('tsm_preview_key', '')); ?>">
                            <p class="description">Copy it from Pando → Settings → Archive preview key. While it's set,
                                you (logged in) also see draft issues on the newsletter page. Visitors only see sent issues.
                                Clear it to turn preview off.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    });
});

add_action('admin_init', function () {
    register_setting('tsm_archive', 'tsm_preview_key', array(
        'type' => 'string',
        'sanitize_callback' => function ($v) {
            return preg_replace('/[^a-f0-9]/', '', strtolower((string) $v));
        },
        'default' => '',
    ));
});

function tsm_api_preview($path)
{
    $response = wp_remote_get(rtrim(TSM_PANDO_URL, '/') . '/api/public' . $path, array(
        'timeout' => 8,
        'headers' => array('Accept' => 'application/json', 'X-Pando-Preview' => get_option('tsm_preview_key', '')),
    ));
    if (is_wp_error($response)) {
        return null;
    }
    $code = wp_remote_retrieve_response_code($response);
    if ($code === 404) {
        return array('_missing' => true);
    }
    $data = $code === 200 ? json_decode(wp_remote_retrieve_body($response), true) : null;
    return is_array($data) ? $data : null;
}

function tsm_preview_banner()
{
    return '<p class="tsm-preview-note">Preview — draft issues are visible only to you while you\'re logged in.</p>';
}

function tsm_api($path)
{
    if (tsm_preview_mode()) {
        return tsm_api_preview($path);
    }
    $key = 'tsm_' . md5($path);
    $fresh = get_transient($key);
    if ($fresh !== false) {
        return $fresh;
    }

    $response = wp_remote_get(rtrim(TSM_PANDO_URL, '/') . '/api/public' . $path, array(
        'timeout' => 6,
        'headers' => array('Accept' => 'application/json'),
    ));

    if (!is_wp_error($response)) {
        $code = wp_remote_retrieve_response_code($response);
        if ($code === 404) {
            // A real "no such issue": remember it briefly so a bad URL can't hammer Pando.
            set_transient($key, array('_missing' => true), 60);
            return array('_missing' => true);
        }
        if ($code === 200) {
            $data = json_decode(wp_remote_retrieve_body($response), true);
            if (is_array($data)) {
                set_transient($key, $data, TSM_CACHE_SECONDS);
                update_option($key . '_last', $data, false);
                return $data;
            }
        }
    }

    // Pando unreachable or misbehaving: keep showing the last good copy rather than breaking the page.
    $last = get_option($key . '_last');
    if (is_array($last)) {
        set_transient($key, $last, 60);
        return $last;
    }
    return null;
}

// Jetpack's image CDN (Photon, "i0.wp.com") rewrites every <img> on the site to load through
// WordPress.com. Pando's photos are already sized and served from Vercel; routed through Photon
// some of them fail to load, so leave anything from Pando or its image storage alone.
function tsm_is_pando_image($src)
{
    return is_string($src) && (
        strpos($src, 'blob.vercel-storage.com') !== false
        || strpos($src, rtrim(TSM_PANDO_URL, '/') . '/') === 0
    );
}
add_filter('jetpack_photon_skip_image', function ($skip, $src = '') {
    return $skip || tsm_is_pando_image($src);
}, 10, 2);
add_filter('jetpack_photon_skip_for_url', function ($skip, $src = '') {
    return $skip || tsm_is_pando_image($src);
}, 10, 2);

function tsm_issue_path($vol, $slug)
{
    return home_url('/' . TSM_PAGE_SLUG . '/' . sprintf('vol-%03d-%s', (int) $vol, $slug) . '/');
}

/* -------------------------------------------------------------------------
 * URLs: /newsletter/vol-001-any-slug  ->  index.php?tsm_vol=1&tsm_slug=any-slug
 * ---------------------------------------------------------------------- */

function tsm_register_rewrites()
{
    add_rewrite_rule(
        '^' . TSM_PAGE_SLUG . '/vol-([0-9]+)(?:-([^/]*))?/?$',
        'index.php?tsm_vol=$matches[1]&tsm_slug=$matches[2]',
        'top'
    );
}
add_action('init', 'tsm_register_rewrites');

add_filter('query_vars', function ($vars) {
    $vars[] = 'tsm_vol';
    $vars[] = 'tsm_slug';
    return $vars;
});

register_activation_hook(__FILE__, function () {
    tsm_register_rewrites();
    flush_rewrite_rules();
});
register_deactivation_hook(__FILE__, function () {
    flush_rewrite_rules();
});

/* -------------------------------------------------------------------------
 * The issue page. WordPress has no post for it, so we hand the theme a
 * virtual page; the theme's own page template then renders it normally.
 * ---------------------------------------------------------------------- */

function tsm_current_issue()
{
    return isset($GLOBALS['tsm_issue']) ? $GLOBALS['tsm_issue'] : null;
}

add_filter('the_posts', function ($posts, $query) {
    if (is_admin() || !$query->is_main_query()) {
        return $posts;
    }
    $vol = (int) $query->get('tsm_vol');
    if ($vol <= 0) {
        return $posts;
    }

    $data = tsm_api('/issues/' . $vol);
    if (!is_array($data) || !empty($data['_missing']) || empty($data['issue'])) {
        $query->set_404();
        status_header(404);
        nocache_headers();
        return array();
    }

    $issue = $data['issue'];

    // Old or hand-typed URL (wrong or outdated slug): send them to the canonical address.
    $wanted = tsm_issue_path($issue['vol'], $issue['slug']);
    $requested = (string) $query->get('tsm_slug');
    if ($requested !== $issue['slug']) {
        wp_safe_redirect($wanted, 301);
        exit;
    }

    $GLOBALS['tsm_issue'] = $data;
    if (tsm_preview_mode()) {
        nocache_headers();
    }

    $post = new WP_Post((object) array(
        'ID' => TSM_FAKE_POST_ID,
        'post_author' => 0,
        'post_date' => $issue['date'] . ' 00:00:00',
        'post_date_gmt' => $issue['date'] . ' 00:00:00',
        'post_content' => '', // filled in by the_content below, after wpautop has run
        'post_title' => $issue['title'],
        'post_excerpt' => $issue['excerpt'],
        'post_status' => 'publish',
        'comment_status' => 'closed',
        'ping_status' => 'closed',
        'post_password' => '',
        'post_name' => sprintf('vol-%03d-%s', (int) $issue['vol'], $issue['slug']),
        'post_type' => 'page',
        'post_parent' => 0,
        'menu_order' => 0,
        'filter' => 'raw',
    ));
    wp_cache_add($post->ID, $post, 'posts');

    $query->is_page = true;
    $query->is_singular = true;
    $query->is_home = false;
    $query->is_archive = false;
    $query->is_category = false;
    $query->is_404 = false;
    $query->post = $post;
    $query->posts = array($post);
    $query->post_count = 1;
    $query->found_posts = 1;
    $query->max_num_pages = 1;
    $query->queried_object = $post;
    $query->queried_object_id = $post->ID;
    status_header(200);

    // These head tags would otherwise be generated for the fake post ID and produce junk URLs.
    remove_action('wp_head', 'rel_canonical');
    remove_action('wp_head', 'wp_shortlink_wp_head', 10);
    remove_action('wp_head', 'wp_oembed_add_discovery_links');

    return array($post);
}, 10, 2);

// The issue's own markup already contains its title (it comes after the masthead and photo),
// so hide the theme's separate page title for this one page.
add_filter('the_title', function ($title, $id = 0) {
    return ((int) $id === TSM_FAKE_POST_ID) ? '' : $title;
}, 10, 2);

add_filter('document_title_parts', function ($parts) {
    $data = tsm_current_issue();
    if ($data) {
        $parts['title'] = $data['issue']['title'];
        unset($parts['tagline']);
    }
    return $parts;
});

add_action('wp_head', function () {
    $data = tsm_current_issue();
    if (!$data) {
        return;
    }
    $i = $data['issue'];
    $url = tsm_issue_path($i['vol'], $i['slug']);
    if (!empty($i['draft'])) {
        echo "\n<meta name=\"robots\" content=\"noindex\" />";
    }
    echo "\n<link rel=\"canonical\" href=\"" . esc_url($url) . "\" />\n";
    echo '<meta name="description" content="' . esc_attr($i['excerpt']) . "\" />\n";
    echo '<meta property="og:type" content="article" />' . "\n";
    echo '<meta property="og:title" content="' . esc_attr($i['title']) . "\" />\n";
    echo '<meta property="og:description" content="' . esc_attr($i['excerpt']) . "\" />\n";
    echo '<meta property="og:url" content="' . esc_url($url) . "\" />\n";
    echo '<meta property="og:site_name" content="' . esc_attr(get_bloginfo('name')) . "\" />\n";
    if (!empty($i['ogImageUrl'])) {
        echo '<meta property="og:image" content="' . esc_url($i['ogImageUrl']) . "\" />\n";
        echo '<meta name="twitter:card" content="summary_large_image" />' . "\n";
        echo '<meta name="twitter:image" content="' . esc_url($i['ogImageUrl']) . "\" />\n";
    }
}, 1);

/* -------------------------------------------------------------------------
 * Markup
 * ---------------------------------------------------------------------- */

function tsm_styles()
{
    static $printed = false;
    if ($printed) {
        return '';
    }
    $printed = true;
    return <<<'CSS'
<style>
.tsm-archive { margin: 3.5em 0 1em; }
.tsm-archive-title { margin: 0 0 1em; }
.tsm-list { list-style: none; margin: 0; padding: 0; }
.tsm-item { display: flex; gap: 20px; align-items: flex-start; margin: 0 0 1.6em; }
.tsm-thumb { flex: 0 0 160px; display: block; }
.tsm-thumb img { display: block; width: 160px; aspect-ratio: 3 / 2; object-fit: cover; }
.tsm-thumb-empty { width: 160px; aspect-ratio: 3 / 2; background: currentColor; opacity: .08; }
.tsm-text { min-width: 0; }
.tsm-vol { font-size: .8em; opacity: .65; margin: 0 0 .25em; }
.tsm-item-title { font-size: 1.15em; line-height: 1.3; text-decoration: none; }
.tsm-item-title:hover { text-decoration: underline; }
@media (max-width: 560px) {
  .tsm-item { flex-direction: column; gap: 10px; }
  .tsm-thumb { flex-basis: auto; width: 100%; }
  .tsm-thumb img, .tsm-thumb-empty { width: 100%; }
}
.tsm-issue, .tsm-pager, .tsm-subscribe, .tsm-preview-note--issue { max-width: 680px; margin-left: auto; margin-right: auto; padding-left: 1.25rem; padding-right: 1.25rem; box-sizing: border-box; }
.tsm-issue p, .tsm-issue li { font-size: 17px; line-height: 1.7; margin: 0 0 1.25em; }
.tsm-issue h1 { font-size: clamp(1.9rem, 4vw, 2.6rem); line-height: 1.2; font-weight: 700; margin: 1.25rem 0 .5rem; }
.tsm-issue h2 { margin: 1.6em 0 .6em; line-height: 1.3; }
.tsm-issue h3 { margin: 1.4em 0 .5em; line-height: 1.3; }
.tsm-issue img { max-width: 100%; height: auto; display: block; }
.tsm-issue .hero-image { width: 100%; margin: 0 0 1.5em; }
/* Masthead lines: kept exactly as typed (Dan writes them lowercase on purpose), like the email. */
.tsm-issue p.meta-text { font-size: .8em; letter-spacing: normal; text-transform: none; opacity: .6; line-height: 1.6; margin: 0 0 1em; }
.tsm-issue .full-bleed-image { width: 100%; margin: 1.5em 0 0; }
.tsm-issue .full-bleed-caption, .tsm-issue .image-caption { display: block; font-size: .8em; opacity: .65; margin: 6px 0 1.5em; text-align: center; }
.tsm-issue .full-bleed-image + :not(.full-bleed-caption) { margin-top: 1.5em; }
.tsm-issue .gallery { margin: 1.5em 0; }
.tsm-issue .gallery-row { display: flex; gap: 10px; margin: 0 0 10px; }
.tsm-issue .gallery-item { margin: 0; min-width: 0; }
.tsm-issue .gallery-item img { width: 100%; height: auto; display: block; border-radius: 4px; }
.tsm-issue .gallery-item figcaption { font-size: .8em; opacity: .65; margin-top: 4px; }
.tsm-issue .gallery--cropped { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tsm-issue .gallery--cropped .gallery-item img { aspect-ratio: 1 / 1; object-fit: cover; }
.tsm-issue hr { border: 0; border-top: 1px solid currentColor; opacity: .3; height: 0; margin: 34px 0; background: none; }
.tsm-issue blockquote { margin: 1.25em 0; padding: 4px 0 4px 16px; border-left: 3px solid currentColor; opacity: .8; font-style: italic; }
.tsm-issue .footnotes { font-size: .85em; opacity: .8; border-top: 1px solid currentColor; margin-top: 2em; padding-top: .5em; }
.tsm-pager { display: flex; justify-content: space-between; gap: 16px; margin-top: 2.5em; margin-bottom: 1em; font-size: .9em; flex-wrap: wrap; }
.tsm-pager a { text-decoration: none; }
.tsm-pager a:hover { text-decoration: underline; }
.tsm-pager .tsm-all { flex-basis: 100%; text-align: center; order: 3; opacity: .75; }
.tsm-preview-note { font-size: .8em; opacity: .7; border: 1px dashed currentColor; padding: 6px 10px; margin: 0 0 1.5em; }
.tsm-draft { text-transform: uppercase; letter-spacing: .05em; font-size: .9em; border: 1px solid currentColor; padding: 0 4px; margin-right: 6px; }
.tsm-subscribe { margin-top: 3em; margin-bottom: 1em; text-align: center; }
.tsm-subscribe p { margin: 0; }
.pando-signup-widget { max-width: 480px; margin: 2em auto 0; font-family: Inconsolata, sans-serif; }
.pando-signup-form { display: flex; gap: 10px; }
.pando-signup-email { flex: 1; font-family: Inconsolata, sans-serif; font-size: 17px; line-height: 1.4; height: 44px; padding: 0 14px; box-sizing: border-box; background: #fff; color: #000; border: 1.5px solid #000; border-radius: 0; }
.pando-signup-submit { font-family: Inconsolata, sans-serif; font-size: 17px; height: 44px; padding: 0 28px; background: #000; color: #fff; border: none; border-radius: 50px; cursor: pointer; transition: 0.2s; }
.pando-signup-message { margin-top: 0.75em; font-size: 0.95em; font-family: Inconsolata, sans-serif; text-align: center; }
.pando-theme-dark .pando-signup-email { background: transparent; color: rgb(232,232,232); border-color: rgba(255,255,255,0.5); }
.pando-theme-dark .pando-signup-submit { background: rgb(240,240,240); color: rgb(17,17,17); }
</style>
CSS;
}

function tsm_pretty_date($ymd)
{
    $t = strtotime($ymd . ' 12:00:00 UTC');
    return $t ? gmdate('F j, Y', $t) : $ymd;
}

function tsm_render_archive()
{
    $data = tsm_api('/issues');
    if (!is_array($data) || empty($data['issues'])) {
        return ''; // Nothing sent yet (or Pando unreachable with no saved copy): show nothing at all.
    }

    $out = tsm_styles();
    $out .= '<section class="tsm-archive">' . (tsm_preview_mode() ? tsm_preview_banner() : '')
        . '<h2 class="tsm-archive-title">Past issues</h2><ul class="tsm-list">';
    foreach ($data['issues'] as $i) {
        $url = tsm_issue_path($i['vol'], $i['slug']);
        $out .= '<li class="tsm-item">';
        $out .= '<a class="tsm-thumb" href="' . esc_url($url) . '" tabindex="-1" aria-hidden="true">';
        if (!empty($i['thumbnailUrl'])) {
            $out .= '<img src="' . esc_url($i['thumbnailUrl']) . '" alt="" width="160" height="107" loading="lazy" decoding="async">';
        } else {
            $out .= '<div class="tsm-thumb-empty"></div>';
        }
        $out .= '</a><div class="tsm-text">';
        $out .= '<p class="tsm-vol">' . (!empty($i['draft']) ? '<span class="tsm-draft">Draft</span>' : '') . esc_html(sprintf('Vol. %03d · %s', (int) $i['vol'], tsm_pretty_date($i['date']))) . '</p>';
        $out .= '<a class="tsm-item-title" href="' . esc_url($url) . '">' . esc_html($i['title']) . '</a>';
        $out .= '</div></li>';
    }
    $out .= '</ul></section>';
    return $out;
}

function tsm_render_issue($data)
{
    $issue = $data['issue'];
    $body = wp_kses_post($issue['bodyHtml']);

    $out = tsm_styles();
    if (tsm_preview_mode()) {
        $out .= str_replace('tsm-preview-note', 'tsm-preview-note tsm-preview-note--issue', tsm_preview_banner());
    }
    $out .= '<div class="tsm-issue">' . $body . '</div>';

    $links = array();
    if (!empty($data['prev'])) {
        $links[] = '<a href="' . esc_url(tsm_issue_path($data['prev']['vol'], $data['prev']['slug'])) . '">&larr; '
            . esc_html(sprintf('Vol. %03d', (int) $data['prev']['vol'])) . '</a>';
    } else {
        $links[] = '<span></span>';
    }
    if (!empty($data['next'])) {
        $links[] = '<a href="' . esc_url(tsm_issue_path($data['next']['vol'], $data['next']['slug'])) . '">'
            . esc_html(sprintf('Vol. %03d', (int) $data['next']['vol'])) . ' &rarr;</a>';
    } else {
        $links[] = '<span></span>';
    }
    $out .= '<nav class="tsm-pager" aria-label="Issues">' . $links[0] . $links[1]
        . '<a class="tsm-all" href="' . esc_url(home_url('/' . TSM_PAGE_SLUG . '/')) . '">All issues</a></nav>';

    $out .= '<div class="tsm-subscribe"><p>Enjoyed this? Get the next one in your inbox.</p>'
        . '<script src="' . esc_url(rtrim(TSM_PANDO_URL, '/') . '/widget.js') . '"></script></div>';

    $out .= tsm_lightbox();
    return $out;
}

// The issue page's content is injected late (priority 99) so wpautop/wptexturize never touch it.
add_filter('the_content', function ($content) {
    $data = tsm_current_issue();
    if ($data && in_the_loop() && is_main_query() && (int) get_the_ID() === TSM_FAKE_POST_ID) {
        return tsm_render_issue($data);
    }
    return $content;
}, 99);

// Add the archive list under the intro + signup form on the newsletter page.
add_filter('the_content', function ($content) {
    if (is_page(TSM_PAGE_SLUG) && in_the_loop() && is_main_query() && !tsm_current_issue()) {
        $content .= tsm_render_archive();
    }
    return $content;
}, 20);

// Shortcode alternative: [three_stops_archive] drops the list anywhere.
add_shortcode('three_stops_archive', function () {
    return tsm_render_archive();
});

/* -------------------------------------------------------------------------
 * Photo lightbox on issue pages: click any photo to view it large; arrows / swipe / arrow
 * keys step through every photo in the issue; X, Esc or a tap outside closes it and leaves
 * you on that photo. A #photo-N in the URL opens photo N directly (same numbering Pando's
 * emails use). Same behavior as Pando's own lib/photoLightbox.ts — keep them in step.
 * ---------------------------------------------------------------------- */

function tsm_lightbox()
{
    return <<<'LIGHTBOX'
<style>
.tsm-issue img{cursor:zoom-in}
.tsm-issue a img{cursor:pointer}
.tsm-lb{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;color:#eee;-webkit-user-select:none;user-select:none}
.tsm-lb[hidden]{display:none}
.tsm-lb-fig{margin:0;display:flex;flex-direction:column;align-items:center;max-width:94vw}
.tsm-lb-img{max-width:94vw;max-height:84vh;width:auto;height:auto;object-fit:contain;display:block}
.tsm-lb-cap{font-size:13px;color:#bbb;margin-top:10px;text-align:center;min-height:1em;padding:0 12px}
.tsm-lb .tsm-lb-btn{position:absolute;background:none;border:0;color:#eee;font:inherit;cursor:pointer;opacity:.75;padding:12px 16px;line-height:1;box-shadow:none}
.tsm-lb .tsm-lb-btn:hover,.tsm-lb .tsm-lb-btn:focus-visible{opacity:1;background:none}
.tsm-lb .tsm-lb-close{top:6px;right:6px;font-size:26px}
.tsm-lb .tsm-lb-prev,.tsm-lb .tsm-lb-next{top:50%;transform:translateY(-50%);font-size:44px}
.tsm-lb .tsm-lb-prev{left:2px}.tsm-lb .tsm-lb-next{right:2px}
.tsm-lb-count{position:absolute;top:16px;left:18px;font-size:13px;color:#aaa}
@media (max-width:600px){.tsm-lb .tsm-lb-prev,.tsm-lb .tsm-lb-next{top:auto;bottom:8px;transform:none}}
</style>
<script>
(function(){
  var imgs=[].slice.call(document.querySelectorAll('.tsm-issue img'));
  if(!imgs.length)return;
  var box=document.createElement('div');
  box.className='tsm-lb';box.hidden=true;box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="tsm-lb-count"></div><button class="tsm-lb-btn tsm-lb-close" aria-label="Close">\u2715</button>'+
    '<button class="tsm-lb-btn tsm-lb-prev" aria-label="Previous photo">\u2039</button>'+
    '<figure class="tsm-lb-fig"><img class="tsm-lb-img" alt=""><figcaption class="tsm-lb-cap"></figcaption></figure>'+
    '<button class="tsm-lb-btn tsm-lb-next" aria-label="Next photo">\u203a</button>';
  document.body.appendChild(box);
  var big=box.querySelector('.tsm-lb-img'),cap=box.querySelector('.tsm-lb-cap'),count=box.querySelector('.tsm-lb-count');
  var prev=box.querySelector('.tsm-lb-prev'),next=box.querySelector('.tsm-lb-next');
  if(imgs.length<2){prev.style.display='none';next.style.display='none';}
  var cur=0;
  function show(i){
    cur=(i+imgs.length)%imgs.length;
    var s=imgs[cur];
    big.src=s.currentSrc||s.src;big.alt=s.alt||'';
    cap.textContent=s.alt||'';
    count.textContent=imgs.length>1?(cur+1)+' / '+imgs.length:'';
    box.hidden=false;document.documentElement.style.overflow='hidden';
    [cur-1,cur+1].forEach(function(j){var p=imgs[(j+imgs.length)%imgs.length];new Image().src=p.currentSrc||p.src;});
  }
  function close(){
    box.hidden=true;document.documentElement.style.overflow='';
    if(location.hash)history.replaceState(null,'',location.pathname+location.search);
    imgs[cur].scrollIntoView({block:'center'});
  }
  imgs.forEach(function(im,i){
    if(im.closest('a'))return;
    im.addEventListener('click',function(){show(i);});
  });
  box.querySelector('.tsm-lb-close').addEventListener('click',close);
  prev.addEventListener('click',function(e){e.stopPropagation();show(cur-1);});
  next.addEventListener('click',function(e){e.stopPropagation();show(cur+1);});
  box.addEventListener('click',function(e){if(e.target===box||e.target.className==='tsm-lb-fig')close();});
  document.addEventListener('keydown',function(e){
    if(box.hidden)return;
    if(e.key==='Escape')close();
    else if(e.key==='ArrowLeft')show(cur-1);
    else if(e.key==='ArrowRight')show(cur+1);
  });
  var x0=null;
  box.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  box.addEventListener('touchend',function(e){
    if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;x0=null;
    if(Math.abs(dx)>50)show(dx<0?cur+1:cur-1);
  });
  function fromHash(){
    var m=location.hash.match(/^#photo-(\d+)$/);if(!m)return;
    var i=parseInt(m[1],10)-1;if(i>=0&&i<imgs.length){imgs[i].scrollIntoView({block:'center'});show(i);}
  }
  window.addEventListener('hashchange',fromHash);
  fromHash();
})();
</script>
LIGHTBOX;
}

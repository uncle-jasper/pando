<?php
/**
 * Plugin Name: 3 Stops from Main Archive
 * Description: Shows past issues of the "3 Stops from Main" newsletter (fetched from Pando) as a list under the signup form on /newsletter, with one page per issue at /newsletter/vol-001-title. Shows nothing until the first issue has been sent.
 * Version: 1.0.0
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

function tsm_api($path)
{
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
.tsm-issue img { max-width: 100%; height: auto; }
.tsm-issue .meta-text { font-size: .8em; opacity: .65; margin: 0 0 .6em; }
.tsm-issue .full-bleed-image { width: 100%; height: auto; display: block; margin: 1em 0; }
.tsm-issue .full-bleed-caption, .tsm-issue .image-caption { display: block; font-size: .8em; opacity: .65; margin: 4px 0 1em; text-align: center; }
.tsm-issue .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: .8em 0; }
.tsm-issue .gallery-item { margin: 0; }
.tsm-issue .gallery-item img { width: 100%; height: auto; display: block; }
.tsm-issue .gallery-item figcaption { font-size: .8em; opacity: .65; margin-top: 4px; }
.tsm-issue .footnotes { font-size: .85em; opacity: .8; border-top: 1px solid currentColor; margin-top: 2em; padding-top: .5em; }
.tsm-pager { display: flex; justify-content: space-between; gap: 16px; margin: 2.5em 0 1em; font-size: .9em; flex-wrap: wrap; }
.tsm-pager a { text-decoration: none; }
.tsm-pager a:hover { text-decoration: underline; }
.tsm-pager .tsm-all { flex-basis: 100%; text-align: center; order: 3; opacity: .75; }
.tsm-subscribe { margin: 3em 0 1em; text-align: center; }
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
    $out .= '<section class="tsm-archive"><h2 class="tsm-archive-title">Past issues</h2><ul class="tsm-list">';
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
        $out .= '<p class="tsm-vol">' . esc_html(sprintf('Vol. %03d · %s', (int) $i['vol'], tsm_pretty_date($i['date']))) . '</p>';
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

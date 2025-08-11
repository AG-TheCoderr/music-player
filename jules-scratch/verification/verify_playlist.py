from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://127.0.0.1:8080/")

        # Wait for the main content to be visible
        expect(page.locator("h1:has-text('Pro Audio Player')")).to_be_visible()

        # Add a few demo tracks to the playlist
        file_loader_card = page.locator("div.p-6.bg-gradient-surface:has(h3:has-text('Load Music'))")
        demo_track_button = file_loader_card.get_by_role("button", name="Demo Track")
        demo_track_button.click()
        demo_track_button.click()
        demo_track_button.click()

        # Wait for the playlist to populate
        playlist_panel = page.locator("div.p-4.bg-gradient-surface")
        expect(playlist_panel.locator("div.flex.items-center.p-2")).to_have_count(3)

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/playlist_verification.png")

        browser.close()

run()

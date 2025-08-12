import time
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        page.goto("http://127.0.0.1:8080/")

        unique_email = f"testuser_{int(time.time())}@example.com"
        password = "password123"

        page.get_by_role("button", name="Login").click()
        page.get_by_role("tab", name="Sign Up").click()
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Password").fill(password)
        page.get_by_role("button", name="Sign Up").click()

        logout_button = page.get_by_role("button", name="Logout")
        expect(logout_button).to_be_visible(timeout=10000)

        demo_track_button = page.locator("div.space-y-6 div.flex.space-x-2 button:has-text('Demo Track')")
        demo_track_button.click()
        demo_track_button.click()

        playlist_panel_selector = "div.p-4.bg-gradient-surface:has(h3:has-text('Up Next'))"
        playlist_content_selector = f"{playlist_panel_selector} div.space-y-2"

        expect(page.locator(playlist_content_selector).locator("div.flex.items-center.p-2")).to_have_count(2)
        print("PLAYLIST BEFORE LOGOUT:", page.inner_html(playlist_content_selector))

        page.wait_for_timeout(3000) # Wait for save

        logout_button.click()
        expect(page.get_by_role("button", name="Login")).to_be_visible()

        page.get_by_role("button", name="Login").click()
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Password").fill(password)
        page.get_by_role("button", name="Login", exact=True).click()

        expect(page.get_by_role("button", name="Logout")).to_be_visible()

        page.wait_for_timeout(3000) # Wait for fetch

        print("PLAYLIST AFTER LOGIN:", page.inner_html(playlist_content_selector))

        expect(page.locator(playlist_content_selector).locator("div.flex.items-center.p-2")).to_have_count(2)

        page.screenshot(path="jules-scratch/verification/debug_screenshot.png")
        browser.close()

run()

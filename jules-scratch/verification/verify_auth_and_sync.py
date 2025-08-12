import time
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://127.0.0.1:8080/")

        # --- Sign Up ---
        # Using a timestamp to ensure the email is unique for each run
        unique_email = f"testuser_{int(time.time())}@example.com"
        password = "password123"

        page.get_by_role("button", name="Login").click()

        # Go to signup tab
        page.get_by_role("tab", name="Sign Up").click()

        # Fill form and sign up
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Password").fill(password)
        page.get_by_role("button", name="Sign Up").click()

        # For this test, we assume auto-login after signup or we need to handle email verification.
        # Supabase default behavior is to require email verification. For this test, let's assume it's disabled or we can proceed.
        # The UI should update to show the logged-in user. Let's wait for the logout button to appear.
        logout_button = page.get_by_role("button", name="Logout")
        expect(logout_button).to_be_visible(timeout=10000)

        # --- Log Out ---
        logout_button.click()
        expect(page.get_by_role("button", name="Login")).to_be_visible()

        # --- Log In ---
        page.get_by_role("button", name="Login").click()
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Password").fill(password)
        page.get_by_role("button", name="Login", exact=True).click()

        # --- Create Playlist ---
        expect(page.get_by_role("button", name="Logout")).to_be_visible()
        demo_track_button = page.locator("div.space-y-6 div.flex.space-x-2 button:has-text('Demo Track')")
        demo_track_button.click()
        demo_track_button.click()

        # Give time for debounced save
        page.wait_for_timeout(3000)

        # --- Log Out Again ---
        page.get_by_role("button", name="Logout").click()
        expect(page.get_by_role("button", name="Login")).to_be_visible()

        # --- Log Back In ---
        page.get_by_role("button", name="Login").click()
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Password").fill(password)
        page.get_by_role("button", name="Login", exact=True).click()

        # --- Verify Playlist Persistence ---
        expect(page.get_by_role("button", name="Logout")).to_be_visible()
        playlist_panel = page.locator("div.p-4.bg-gradient-surface:has(h3:has-text('Up Next'))")
        expect(playlist_panel.locator("div.flex.items-center.p-2")).to_have_count(2)

        # --- Screenshot ---
        page.screenshot(path="jules-scratch/verification/auth_and_sync_verification.png")

        browser.close()

run()

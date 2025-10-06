def export_header_html(org_settings: dict, proj_code: str | None = None):
    color = (org_settings or {}).get("theme_color") or "#111111"
    cust_img = org_settings.get("customer_logo_path")
    vend_img = org_settings.get("vendor_logo_path")
    cust_url = f"/branding/logo?which=customer"
    vend_url = f"/branding/logo?which=vendor"
    title = org_settings.get("customer_name") or "TEAIM"
    sub = f"Project: {proj_code}" if proj_code else ""

    # Use proxy endpoints; the public page can request them if authless is allowed or you pre-render on server.
    l = f'<img src="{cust_url}" style="height:20px" alt="cust"/>' if cust_img else (org_settings.get("customer_name","") or "")
    r = f'<img src="{vend_url}" style="height:20px" alt="vend"/>' if vend_img else f'<span style="font-weight:700;color:{color}">TEAIM</span>'

    return f"""
    <div class="export-header" style="border-color:{color}">
      <div class="left">{l}</div>
      <div class="title">{title}</div>
      <div class="right">{r}</div>
    </div>
    <div class="export-subtle">{sub}</div>
    """
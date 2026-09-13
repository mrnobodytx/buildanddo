from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import json, os, urllib.request, urllib.error


class ProviderError(RuntimeError):
    pass


@dataclass
class HttpResult:
    status: int
    body: dict[str, Any]


class JsonHttp:
    def __init__(self, token: str, timeout: int = 30):
        self.token = token
        self.timeout = timeout

    def request(self, method: str, url: str, payload: dict[str, Any] | None = None) -> HttpResult:
        data = None if payload is None else json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header('Authorization', f'Bearer {self.token}')
        req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                raw = r.read().decode('utf-8', 'replace')
                return HttpResult(r.status, json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            raw = e.read().decode('utf-8', 'replace')
            raise ProviderError(f'{method} {url} -> {e.code}: {raw[:500]}') from e


class CloudflareMoQ:
    def __init__(self, *, account_id: str | None = None, api_token: str | None = None,
                 api_base: str = 'https://api.cloudflare.com/client/v4'):
        self.account_id = account_id or os.getenv('CLOUDFLARE_ACCOUNT_ID', '')
        self.api_token = api_token or os.getenv('CLOUDFLARE_API_TOKEN', '')
        self.api_base = api_base.rstrip('/')
        if not self.account_id or not self.api_token:
            raise ProviderError('Cloudflare MoQ requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN')
        self.http = JsonHttp(self.api_token)

    def create_relay(self, name: str) -> dict[str, Any]:
        url = f'{self.api_base}/accounts/{self.account_id}/moq/relays'
        result = self.http.request('POST', url, {'name': name})
        if result.status not in (200, 201):
            raise ProviderError(f'create relay unexpected status {result.status}')
        return result.body.get('result', result.body)

    def delete_relay(self, relay_id: str) -> None:
        url = f'{self.api_base}/accounts/{self.account_id}/moq/relays/{relay_id}'
        self.http.request('DELETE', url)


class CloudflareRealtimeSFU:
    """Thin API adapter.

    Endpoint templates are passed by configuration because provider path/version
    changes must not silently alter experiment semantics. The adapter does not
    claim DataChannel/media success; callers must record observed send/receive evidence.
    """
    def __init__(self, *, account_id: str | None = None, api_token: str | None = None,
                 app_id: str | None = None, api_base: str = 'https://api.cloudflare.com/client/v4'):
        self.account_id = account_id or os.getenv('CLOUDFLARE_ACCOUNT_ID', '')
        self.api_token = api_token or os.getenv('CLOUDFLARE_API_TOKEN', '')
        self.app_id = app_id or os.getenv('CLOUDFLARE_REALTIME_APP_ID', '')
        self.api_base = api_base.rstrip('/')
        if not self.account_id or not self.api_token or not self.app_id:
            raise ProviderError('Cloudflare Realtime requires account id, API token, and app id')
        self.http = JsonHttp(self.api_token)

    def create_session(self, path_template: str) -> dict[str, Any]:
        path = path_template.format(account_id=self.account_id, app_id=self.app_id)
        result = self.http.request('POST', self.api_base + path, {})
        return result.body.get('result', result.body)

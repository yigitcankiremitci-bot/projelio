#!/usr/bin/env python3
"""Supabase Storage kovalarını ve nesnelerini iki Storage API arasında taşır."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def api(url: str, key: str, method: str = "GET", body=None, headers=None):
    request_headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
    }
    if headers:
        request_headers.update(headers)
    data = None
    if body is not None:
        if isinstance(body, bytes):
            data = body
        else:
            data = json.dumps(body).encode()
            request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content = response.read()
            if response.headers.get_content_type() == "application/json":
                return json.loads(content or b"null")
            return content
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:500]
        raise RuntimeError(f"{method} {url}: HTTP {error.code}: {detail}") from error


def encoded_path(value: str) -> str:
    return "/".join(urllib.parse.quote(part, safe="") for part in value.split("/"))


def list_objects(base_url: str, key: str, bucket_id: str):
    pending = [""]
    while pending:
        prefix = pending.pop()
        offset = 0
        while True:
            entries = api(
                f"{base_url}/object/list/{urllib.parse.quote(bucket_id, safe='')}",
                key,
                "POST",
                {"prefix": prefix, "limit": 100, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
            )
            for entry in entries:
                name = f"{prefix}/{entry['name']}" if prefix else entry["name"]
                if entry.get("id") is None:
                    pending.append(name)
                else:
                    yield name, entry
            if len(entries) < 100:
                break
            offset += len(entries)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--target-url", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source_key = os.environ.get("SOURCE_SERVICE_ROLE_KEY")
    target_key = os.environ.get("TARGET_SERVICE_ROLE_KEY")
    if not source_key or not target_key:
        parser.error("SOURCE_SERVICE_ROLE_KEY ve TARGET_SERVICE_ROLE_KEY zorunlu")

    source_url = args.source_url.rstrip("/")
    target_url = args.target_url.rstrip("/")
    buckets = api(f"{source_url}/bucket", source_key)
    copied = 0
    verified = 0

    for bucket in buckets:
        bucket_id = bucket["id"]
        objects = list(list_objects(source_url, source_key, bucket_id))
        print(f"{bucket_id}: {len(objects)} nesne")
        if args.dry_run:
            copied += len(objects)
            continue

        payload = {
            "id": bucket_id,
            "name": bucket.get("name") or bucket_id,
            "public": bool(bucket.get("public")),
            "file_size_limit": bucket.get("file_size_limit"),
            "allowed_mime_types": bucket.get("allowed_mime_types"),
        }
        try:
            api(f"{target_url}/bucket", target_key, "POST", payload)
        except RuntimeError as error:
            if "already exists" not in str(error).lower() and "duplicate" not in str(error).lower():
                raise
            api(
                f"{target_url}/bucket/{urllib.parse.quote(bucket_id, safe='')}",
                target_key,
                "PUT",
                {key: value for key, value in payload.items() if key not in {"id", "name"}},
            )

        for object_name, metadata in objects:
            path = f"{urllib.parse.quote(bucket_id, safe='')}/{encoded_path(object_name)}"
            content = api(f"{source_url}/object/authenticated/{path}", source_key)
            content_type = (metadata.get("metadata") or {}).get("mimetype")
            content_type = content_type or mimetypes.guess_type(object_name)[0] or "application/octet-stream"
            api(
                f"{target_url}/object/{path}",
                target_key,
                "POST",
                content,
                {"Content-Type": content_type, "x-upsert": "true"},
            )
            target_content = api(f"{target_url}/object/authenticated/{path}", target_key)
            if hashlib.sha256(content).digest() != hashlib.sha256(target_content).digest():
                raise RuntimeError(f"Doğrulama başarısız: {bucket_id}/{object_name}")
            copied += 1
            verified += 1

    summary = f"toplam: {len(buckets)} kova, {copied} nesne"
    if args.dry_run:
        summary += " (dry-run)"
    else:
        summary += f", {verified} SHA-256 doğrulandı"
    print(summary)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"HATA: {error}", file=sys.stderr)
        raise SystemExit(1)

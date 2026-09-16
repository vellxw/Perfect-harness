"""Deterministic, complete work partitions for the auxiliary visual reviewer.

No inference score or tool output is an authorization to merge or publish.
"""
from __future__ import annotations
import hashlib
import json


def partition_images(images: list[dict], index: int, count: int) -> list[dict]:
    if not 1 <= count <= 16 or not 0 <= index < count:
        raise ValueError('Invalid review partition')
    names = [item['path'] for item in images]
    if len(set(names)) != len(names) or len(names) < count:
        raise ValueError('Duplicate evidence or empty review partition')
    return images[index::count]


def selection_hash(images: list[dict]) -> str:
    data = json.dumps([(i['path'], i['sha256']) for i in images], separators=(',', ':')).encode()
    return hashlib.sha256(data).hexdigest()


def merge_reports(reports: list[dict], expected: list[dict]) -> dict:
    if not reports:
        raise ValueError('No review reports')
    first = reports[0]
    n = first['partition']['count']
    if len(reports) != n or sorted(r['partition']['index'] for r in reports) != list(range(n)):
        raise ValueError('Review partitions missing or duplicated')
    items = []
    for report in reports:
        if report['status'] != 'OBSERVATIONS_READY_NOT_APPROVAL':
            raise ValueError('Incomplete review is not accepted')
        for field in ['sourceCommit', 'reviewerSourceCommit', 'evidenceArtifactId', 'evidenceArtifactSha256', 'acceptanceSha256', 'model', 'modelRevision', 'weights', 'promptSha256']:
            if report[field] != first[field]:
                raise ValueError('Different source, model, or evidence: ' + field)
        part = report['partition']
        if part['count'] != n or part['fullSelectionSha256'] != selection_hash(expected):
            raise ValueError('Selection changed')
        selected = partition_images(expected, part['index'], n)
        actual = report['items']
        if [(i['path'], i['sha256']) for i in actual] != [(i['path'], i['sha256']) for i in selected]:
            raise ValueError('Partition did not observe every assigned item')
        if any(not i.get('rawResponse', '').strip() or i.get('status') not in ['OBSERVED', 'UNSTRUCTURED_REQUIRES_REVIEW'] for i in actual):
            raise ValueError('Missing visual observation')
        items.extend(actual)
    by_path = {i['path']: i for i in items}
    if len(by_path) != len(expected) or len(items) != len(expected):
        raise ValueError('Coverage was reduced or duplicated')
    result = {k: v for k, v in first.items() if k not in ['items', 'partition', 'elapsedSeconds']}
    result['items'] = [by_path[e['path']] for e in expected]
    result['partitions'] = n
    result['elapsedSecondsByPartition'] = [r['elapsedSeconds'] for r in sorted(reports, key=lambda r: r['partition']['index'])]
    result['status'] = 'OBSERVATIONS_READY_NOT_APPROVAL'
    result['coverage'] = {'expected': len(expected), 'observed': len(items), 'selectionSha256': selection_hash(expected)}
    return result

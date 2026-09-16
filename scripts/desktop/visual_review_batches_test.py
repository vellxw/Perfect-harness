import unittest
from copy import deepcopy
from visual_review_batches import partition_images, selection_hash, merge_reports

class ReviewPartitions(unittest.TestCase):
    def setUp(self):
        self.images = [{'path': f'frame-{i:02}.png', 'sha256': f'{i:064x}'} for i in range(28)]
        self.reports = []
        for index in range(7):
            self.reports.append(dict(status='OBSERVATIONS_READY_NOT_APPROVAL', sourceCommit='source', reviewerSourceCommit='reviewer', evidenceArtifactId=1, evidenceArtifactSha256='archive', acceptanceSha256='acceptance', model='model', modelRevision='pinned', weights=[{'sha256': 'weights'}], promptSha256='prompt', elapsedSeconds=1200, partition={'index': index, 'count': 7, 'fullSelectionSha256': selection_hash(self.images)}, items=[dict(i, rawResponse='Actual observation', status='OBSERVED') for i in partition_images(self.images, index, 7)]))
    def test_complete_disjoint_cover(self):
        result = merge_reports(self.reports[::-1], self.images)
        self.assertEqual(result['coverage']['observed'], 28)
        self.assertEqual([i['path'] for i in result['items']], [i['path'] for i in self.images])
        self.assertEqual(result['status'], 'OBSERVATIONS_READY_NOT_APPROVAL')
    def test_incomplete_or_stale_or_repeated_is_rejected(self):
        for field, value in [('status','INCOMPLETE'), ('sourceCommit','other'), ('modelRevision','other'), ('promptSha256','other')]:
            reports = deepcopy(self.reports); reports[0][field] = value
            with self.assertRaises(ValueError): merge_reports(reports,self.images)
        with self.assertRaises(ValueError): merge_reports(self.reports[:-1],self.images)
        with self.assertRaises(ValueError): merge_reports(self.reports[:-1]+[self.reports[0]],self.images)
    def test_item_cannot_be_omitted_replaced_or_duplicated(self):
        for mutation in ['omit','hash','duplicate','no-response']:
            reports = deepcopy(self.reports)
            if mutation=='omit': reports[0]['items'].pop()
            elif mutation=='hash': reports[0]['items'][0]['sha256']='tampered'
            elif mutation=='duplicate': reports[0]['items'][1]=reports[0]['items'][0]
            else: reports[0]['items'][0]['rawResponse']=''
            with self.assertRaises(ValueError): merge_reports(reports,self.images)
    def test_invalid_partition(self):
        for index,count in [(0,0),(7,7),(-1,7),(0,29)]:
            with self.assertRaises(ValueError): partition_images(self.images,index,count)

if __name__ == '__main__': unittest.main()

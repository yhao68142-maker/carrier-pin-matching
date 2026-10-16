import unittest
from engine import ranked_matches, ranked_four_dimensions
from fastapi.testclient import TestClient
from app import app

class RankingTests(unittest.TestCase):
    def test_ties_boundaries_and_failed_dimensions(self):
        records=[{'x':'136.9','y':'57','code':'same1'},
                 {'x':'136.9','y':'57','code':'same2'},
                 {'x':'136.91','y':'56.99','code':'boundary'},
                 {'x':'136.910001','y':'57','code':'failX'},
                 {'x':'136.9','y':'58','code':'failY'}]
        rows=ranked_matches(records,'136.9','57')
        self.assertEqual([r['code'] for r in rows],['same1','same2','boundary','failX','failY'])
        self.assertEqual([r['rank'] for r in rows],[1,1,3,4,5])
        self.assertTrue(rows[2]['qualified'])
        self.assertFalse(rows[3]['passX']);self.assertTrue(rows[3]['passY'])
        self.assertTrue(rows[4]['passX']);self.assertFalse(rows[4]['passY'])
        self.assertEqual(rows[0]['similarity'],'100.00')
    def test_percentage_zero_and_no_match(self):
        rows=ranked_matches([{'x':'100','y':'100'}],'90','80')
        self.assertEqual(rows[0]['similarity'],'85.00')
        self.assertFalse(rows[0]['qualified'])
        self.assertEqual(ranked_matches([{'x':'0','y':'0'}],0,0)[0]['similarity'],'100.00')
        self.assertEqual(ranked_matches([{'x':'0','y':'0'}],1,1)[0]['similarity'],'0.00')
    def test_real_catalog_api(self):
        with TestClient(app) as client:
            response=client.post('/api/rank',json={'x':'136.90000000000416','y':'57.00000000000002','length':'185','width':'92'})
            self.assertEqual(response.status_code,200)
            rows=response.json()
            self.assertEqual(len(rows),65)
            self.assertEqual(sum(r['qualified'] for r in rows),22)
            self.assertEqual(sum(r['rank']==1 for r in rows),22)
            self.assertEqual(client.post('/api/rank',json={'x':'NaN','y':'57','length':'185','width':'92'}).status_code,400)
    def test_four_dimensions_and_missing_standards(self):
        records=[{'x':'136.9','y':'57','length':'185','width':'92'},
                 {'x':'136.9','y':'57','length':'180','width':'92'},
                 {'x':'136.9','y':'57','length':None,'width':None}]
        rows=ranked_four_dimensions(records,'136.9','57','180','92')
        self.assertTrue(rows[0]['qualified']);self.assertEqual(rows[0]['similarity'],'100.00')
        self.assertFalse(rows[1]['qualified']);self.assertTrue(rows[1]['passX']);self.assertFalse(rows[1]['passLength'])
        self.assertIsNone(rows[2]['similarity']);self.assertIsNone(rows[2]['rank']);self.assertFalse(rows[2]['qualified'])
        self.assertTrue(ranked_four_dimensions(records[:1],'136.9','57','185.01','91.99')[0]['qualified'])
        self.assertFalse(ranked_four_dimensions(records[:1],'136.9','57','185.010001','92')[0]['qualified'])

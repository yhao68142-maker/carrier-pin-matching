import tempfile
import unittest
from pathlib import Path
import cadquery as cq
from engine import analyze, measure, exact_matches

class GeometryTests(unittest.TestCase):
    def test_exact_matching(self):
        records=[{'x':'136.9','y':'57'},{'x':'136.9','y':'7'}]
        self.assertEqual(len(exact_matches(records,'136.900','57.0')),1)
        self.assertEqual(len(exact_matches(records,'136.9000000001','57')),1)
        self.assertEqual(len(exact_matches(records,'136.91','56.99')),1)
        self.assertEqual(len(exact_matches(records,'136.89','57.01')),1)
        self.assertEqual(exact_matches(records,'136.91000001','57'),[])
        self.assertEqual(exact_matches(records,'136.9','57.01000001'),[])
        self.assertEqual(exact_matches(records,'57','136.9'),[])
        for invalid in ['NaN','Infinity','-1','abc']:
            with self.assertRaises(ValueError): exact_matches(records,invalid,'57')

    def test_step_and_rotation(self):
        carrier=cq.Workplane('XY').box(180,92,3).faces('>Z').workplane().pushPoints([(-68.45,-28.5),(68.45,28.5)]).circle(1.45).extrude(4)
        # A through-hole must not be treated as a protruding locating pin.
        carrier=carrier.cut(cq.Workplane('XY').center(-80,0).circle(2).extrude(20,both=True))
        for rotate in [False,True]:
            part=carrier.rotate((0,0,0),(1,2,3),33) if rotate else carrier
            with tempfile.TemporaryDirectory() as directory:
                path=Path(directory)/'carrier.step'
                cq.exporters.export(part,str(path))
                result=analyze(path)
            self.assertEqual(len(result['pins']),2)
            dims=measure(result['pins'],0,1)
            # Geometry test allowance is not a catalog matching tolerance.
            self.assertAlmostEqual(float(dims['x']),136.9,places=8)
            self.assertAlmostEqual(float(dims['y']),57,places=8)
            self.assertTrue(result['triangles'])
            with self.assertRaises(ValueError):measure(result['pins'],0,0)

if __name__=='__main__': unittest.main()

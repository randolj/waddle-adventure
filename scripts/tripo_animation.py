#!/usr/bin/env python3
"""Resumable skeletal rig and animation requests using the existing local Tripo key.

Usage: tripo_animation.py submit|poll drifter|gremlin|charger check|rig|clips
Only submit creates tasks. Existing task records are never resubmitted automatically.
"""
import argparse
import json
from pathlib import Path
import sys
import tripo_assets as tripo

ROOT=tripo.ROOT


def record(name,stage):
    return tripo.state_path(name+'-'+stage)


def submit(name,stage):
    path=record(name,stage)
    if path.exists():
        print(f'{name} {stage}: existing task retained; poll instead.')
        return
    source=json.loads((ROOT/'art-src/tripo-models'/f'{name}.json').read_text())['task_id']
    if stage=='check':
        endpoint='/animations/rig-check'
        payload={'input':source}
    elif stage=='rig':
        check=json.loads(record(name,'check').read_text()).get('result',{}).get('output',{})
        if not check.get('riggable'):
            raise RuntimeError('Rig check must complete successfully before rigging.')
        kind=check['rig_type']
        endpoint='/animations/rig'
        payload={'input':source,'model':'v3.0-20260909','rig_type':kind,'spec':'mixamo','out_format':'glb'}
    else:
        rig=json.loads(record(name,'rig').read_text())
        if rig.get('result',{}).get('status')!='success':
            raise RuntimeError('Rig must finish before requesting clips.')
        kind=rig['parameters']['rig_type']
        animations=['preset:idle','preset:walk','preset:slash','preset:dive','preset:hurt'] if kind=='biped' else ['preset:quadruped:walk']
        endpoint='/animations/retarget'
        payload={'input':rig['task_id'],'animations':animations,'out_format':'glb','animate_in_place':True}
    # Preserve intent before submitting: ambiguous failures require reconciliation, not another charge.
    path.write_text(json.dumps({'status':'submitting','parameters':payload},indent=2))
    result=tripo.request(endpoint,payload)
    path.write_text(json.dumps({'task_id':result['task_id'],'parameters':payload},indent=2))
    print(f"{name} {stage}: submitted {result['task_id']}")


def poll(name,stage):
    path=record(name,stage)
    task=json.loads(path.read_text())
    if 'task_id' not in task:
        raise RuntimeError('Ambiguous submission; reconcile the task in Tripo before resubmitting.')
    result=tripo.request('/tasks/'+task['task_id'])
    print(f"{name} {stage}: {result['status']} {result.get('progress',0)}%")
    if result['status']=='success':
        # Keep the complete server result locally (signed URLs never enter the repository).
        task['result']=result
        path.write_text(json.dumps(task,indent=2))
        if stage=='check':
            print(json.dumps(result['output']))
            return
        target=ROOT/'art-src/tripo-models/animation'/f'{name}-{stage}.glb'
        if not target.exists():
            tripo.download(result['output']['model_url'],target)
        provenance={'task_id':task['task_id'],'parameters':task['parameters'],
                    'credits_consumed':result.get('credits_consumed')}
        target.with_suffix('.json').write_text(json.dumps(provenance,indent=2)+'\n')
        print('Saved '+str(target.relative_to(ROOT)))
    elif result['status'] in ('failed','cancelled','banned','expired'):
        raise RuntimeError('Task ended: '+result['status'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('submit','poll'))
    parser.add_argument('name',choices=('drifter','gremlin','charger'))
    parser.add_argument('stage',choices=('check','rig','clips'))
    args=parser.parse_args()
    try:
        (submit if args.command=='submit' else poll)(args.name,args.stage)
    except (OSError,ValueError,RuntimeError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)

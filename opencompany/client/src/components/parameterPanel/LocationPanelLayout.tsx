import React from 'react';
import { Node } from 'reactflow';
import InputSection from './InputSection';
import MiddleSection from './MiddleSection';
import MapsSection from './MapsSection';
import { INodeTypeDescription } from '../../types/INodeProperties';

interface LocationPanelLayoutProps {
  // Node data
  selectedNode: Node;
  nodeDefinition: INodeTypeDescription;
  parameters: Record<string, any>;
  hasUnsavedChanges: boolean;

  // Parameter handling
  onParameterChange: (paramName: string, value: any) => void;

  // Layout configuration
  showInputSection?: boolean;
}

const LocationPanelLayout: React.FC<LocationPanelLayoutProps> = ({
  selectedNode,
  nodeDefinition,
  parameters,
  hasUnsavedChanges: _hasUnsavedChanges,
  onParameterChange,
  showInputSection = true
}) => {
  return (
    <div className="flex h-full min-h-0">
      {/* Left: Input Nodes JSON Data */}
      {showInputSection && (
        <div className="h-full flex-1 overflow-hidden">
          <InputSection
            nodeId={selectedNode.id}
            visible={showInputSection}
          />
        </div>
      )}

      {/* Middle: Parameter Content */}
      <div className="h-full flex-1 overflow-hidden">
        <MiddleSection
          nodeId={selectedNode.id}
          nodeDefinition={nodeDefinition}
          parameters={parameters}
          onParameterChange={onParameterChange}
        />
      </div>

      {/* Right: Maps Section */}
      <div className="h-full flex-1 overflow-hidden">
        <MapsSection
          selectedNode={selectedNode}
          nodeDefinition={nodeDefinition}
          parameters={parameters}
          onParameterChange={onParameterChange}
        />
      </div>
    </div>
  );
};

export default LocationPanelLayout;
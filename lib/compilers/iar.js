// Copyright (c) 2016, Matt Godbolt
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
const path = require('path');
const fs = require('fs');
const BaseCompiler = require('../base-compiler');
const AsmParser = require('../asm-parser');

class IARAsmParser extends AsmParser {
    tryParseAsmLine(trimmedAsmLineText, sourceLineNumber) {
        let line = trimmedAsmLineText;
        if( !line.startsWith('\\') || sourceLineNumber == 0 ) {
            return null;
        }

        // Returns null if not a line.
        // Normally, returns an ASMLineData
        // Skip passed the '\'
        line = line.substr(1).trim();
        if( line.startsWith("0x") ) {
            // Instruction.
            let splits = line.split(' ').filter(val => val && !val.startsWith('0x'));
            if( splits.length == 0 ) {
                return null;
            }

            let newSplits = [];
            newSplits.push(splits[0].padEnd(12, ' '));

            let str = '';
            for( let i = 1; i < splits.length; ++i ) {
                // Stop at the comments.
                if( !splits[i].startsWith(';') ) {
                    str += splits[i];
                }
                else if( str ) {
                    newSplits.push(str.padEnd(18, ' '));
                    newSplits.push(splits.splice(i).join(' '));
                    str = ''
                    break;
                }
            }
            if( str ) {
                newSplits.push(str);
            }

            line = newSplits.filter(val => val).join(' ');
            line = `    ${line}`;
        }
        else if( !line.startsWith('In') && !line.startsWith('__') ){
            // Label
            // labels.push(line.substr(0, line.indexOf(':')));
            line = line.substr(0, line.lastIndexOf(':') + 1);
        }
        else {
            return null;
        }
    
        return {
            source: {
                file: null,
                line: sourceLineNumber
            },
            text: line,
            labels: []
        };
    }

    tryParseSourceMappedLine(trimmedAsmLineText, sourceLineNumber) {
        // Returns a new sourceLineNumber if it was able to parse one. Otherwise return the input.
        let line = trimmedAsmLineText;
        let firstSpace = line.indexOf(' ');
        if( firstSpace > 0 ) {
            let testIfNum = line.substr(0, firstSpace);
            if( !isNaN(testIfNum) ) {
                line = line.substr(firstSpace).trim();
                // Don't care about comment lines.
                if( !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*') ) {
                    return Number.parseInt(testIfNum);
                }
                else {
                    return 0;
                }
            }
        }
        
        return sourceLineNumber;
    }

    gatherLabels(asmDatas) {
        let labels = [];

        for( let asmData of asmDatas ) {
            let lineText = asmData.text;
            if( lineText.endsWith(':') ) {
                labels.push(lineText.substr(0, lineText.length-1));
            }
        }

        return labels;
    }

    markLabelsInLine(asmData, labels) {
        let asmLineText = asmData.text;
        if( asmLineText.endsWith(':') ) {
            return;
        }

        for( let label of labels ) {
            let labelIndex = asmLineText.indexOf(label);
            if( labelIndex >= 0 ) {
                asmData.labels.push({
                    name: label,
                    range: {
                        startCol: labelIndex,
                        endCol: labelIndex + label.length
                    }
                })
            }
        }
    }

    processAsm(asmDataInput, filters) {
        let currentSourceLine = 0;
        let asmDataList = [];

        for( let asmLineData of asmDataInput ) {
            let trimmedAsmLineText = asmLineData.text.trim();

            if( trimmedAsmLineText.startsWith('\\') ) {
                let asmData = this.tryParseAsmLine(trimmedAsmLineText, currentSourceLine);
                if( asmData ) {
                    asmDataList.push(asmData);
                }
            }
            else {
                // Check if source Line
                currentSourceLine = this.tryParseSourceMappedLine(trimmedAsmLineText, currentSourceLine);
            }
        }

        let labels = this.gatherLabels(asmDataList);

        // Find label Locations
        for( let asmLineData of asmDataList ) {
            this.markLabelsInLine(asmLineData, labels);
        }

        return { 
            asm: asmDataList, 
            labelDefinitions: null 
        };
    }
}


class IARCompiler extends BaseCompiler {
    constructor(compilerProps, env) {
        super(compilerProps, env);

        this.defaultAsm = this.asm;
        this.asm = new IARAsmParser(this._compilerProps);

    }
    optionsForFilter(filters, outputFilename) {
        const fname = this.filename(outputFilename);
        let options = ['-o', fname, '-lC', path.dirname(fname), '--dlib_config', "C:\\Program Files (x86)\\IAR Systems\\Embedded Workbench 8.3\\arm\\inc\\c\\DLib_Config_Full.h"];
        return options;
    }

    getOutputFilename(dirPath, outputFilebase) {
        // NB keep lower case as ldc compiler `tolower`s the output name
        return path.join(dirPath, `${outputFilebase}.o`);
    }

    async execPostProcess(result, postProcesses, outputFilename, maxSize) {
        const ppFile = outputFilename.replace('.o', '.lst');
        const contents = fs.readFileSync(ppFile);
        result.asm = contents.toString();

        return result;
    }

    processAsm(result, filters) {
        let { asm, labelDefinitions } = this.defaultAsm.process(result.asm, filters);

        let res = this.asm.process(asm, filters);
        return res;
    }

}

module.exports = IARCompiler;
